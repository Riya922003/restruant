const { ApiError } = require("../../utils/api-error");

// Item mutations and header edits are allowed only while the order is in one of
// these states. Once served or terminal, the order is locked.
const EDITABLE_STATUSES = ["open", "sent_to_kitchen", "preparing", "ready"];
const TERMINAL_STATUSES = ["completed", "cancelled"];

// Allowed status transitions with the roles permitted to perform each. Owner is
// always allowed (checked separately via bypass).
const TRANSITIONS = {
  open: { sent_to_kitchen: ["manager", "waiter"] },
  sent_to_kitchen: { preparing: ["manager", "chef"] },
  preparing: { ready: ["manager", "chef"] },
  ready: { served: ["manager", "waiter"] },
  served: { completed: ["manager"] },
};

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

async function getTaxRate(client) {
  const { rows } = await client.query("SELECT tax_rate FROM restaurant_profile WHERE id = 1");
  return rows[0] ? Number(rows[0].tax_rate) : 0;
}

// Recompute subtotal/tax/total from the order's line items and persist them.
// discount is validated against the fresh subtotal.
async function recomputeTotals(client, orderId, discount) {
  const sumResult = await client.query(
    "SELECT COALESCE(SUM(line_total), 0) AS subtotal FROM order_items WHERE order_id = $1",
    [orderId]
  );
  const subtotal = round2(sumResult.rows[0].subtotal);
  const appliedDiscount = round2(discount || 0);

  if (appliedDiscount > subtotal) {
    throw new ApiError(422, "Discount exceeds subtotal");
  }

  const taxRate = await getTaxRate(client);
  const tax = round2(((subtotal - appliedDiscount) * taxRate) / 100);
  const total = round2(subtotal - appliedDiscount + tax);

  await client.query(
    "UPDATE orders SET subtotal = $1, discount = $2, tax = $3, total = $4 WHERE id = $5",
    [subtotal, appliedDiscount, tax, total, orderId]
  );
  return { subtotal, discount: appliedDiscount, tax, total };
}

// ORD-YYYY-NNNNNN, sequential per calendar year. Called inside the create
// transaction; a unique-violation retry is handled by the caller.
async function generateOrderNumber(client, year) {
  const prefix = `ORD-${year}-`;
  const { rows } = await client.query(
    `SELECT COALESCE(MAX((split_part(order_number, '-', 3))::int), 0) + 1 AS seq
     FROM orders WHERE order_number LIKE $1`,
    [`${prefix}%`]
  );
  const seq = rows[0].seq;
  return `${prefix}${String(seq).padStart(6, "0")}`;
}

async function occupyTable(client, tableId) {
  if (!tableId) return;
  await client.query("UPDATE restaurant_tables SET status = 'occupied' WHERE id = $1", [tableId]);
}

// Free a table only if no other active dine-in order still holds it.
async function freeTableIfUnused(client, tableId, excludeOrderId) {
  if (!tableId) return;
  const { rows } = await client.query(
    `SELECT 1 FROM orders
     WHERE table_id = $1 AND id <> $2 AND order_type = 'dine_in'
       AND status <> ALL($3::order_status[]) LIMIT 1`,
    [tableId, excludeOrderId, TERMINAL_STATUSES]
  );
  if (!rows[0]) {
    await client.query("UPDATE restaurant_tables SET status = 'available' WHERE id = $1", [tableId]);
  }
}

function assertTransition(from, to, role) {
  if (TERMINAL_STATUSES.includes(from)) {
    throw new ApiError(409, `Order is ${from} and cannot change status`);
  }
  if (to === "cancelled") {
    if (role !== "owner" && role !== "manager") {
      throw new ApiError(403, "Only a manager or owner can cancel an order");
    }
    return;
  }
  const allowedRoles = TRANSITIONS[from] && TRANSITIONS[from][to];
  if (!allowedRoles) {
    throw new ApiError(409, `Invalid status transition ${from} -> ${to}`);
  }
  if (role !== "owner" && !allowedRoles.includes(role)) {
    throw new ApiError(403, `Your role cannot move an order from ${from} to ${to}`);
  }
}

module.exports = {
  EDITABLE_STATUSES,
  TERMINAL_STATUSES,
  round2,
  recomputeTotals,
  generateOrderNumber,
  occupyTable,
  freeTableIfUnused,
  assertTransition,
};
