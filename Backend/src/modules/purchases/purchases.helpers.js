const { ApiError } = require("../../utils/api-error");

// Terminal PO states: no further transitions are permitted.
const TERMINAL = ["received", "cancelled"];

// Legal PO status transitions. partially_received and received are normally
// reached via the receive endpoint, but the map is the source of truth.
const ALLOWED_TRANSITIONS = {
  draft: ["ordered", "cancelled"],
  ordered: ["partially_received", "received", "cancelled"],
  partially_received: ["received", "cancelled"],
};

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

async function getTaxRate(client) {
  const { rows } = await client.query("SELECT tax_rate FROM restaurant_profile WHERE id = 1");
  return rows[0] ? Number(rows[0].tax_rate) : 0;
}

// PO-YYYY-NNNNNN, sequential per calendar year. Called inside the create
// transaction; a unique-violation retry is handled by the caller.
async function generatePoNumber(client, year) {
  const prefix = `PO-${year}-`;
  const { rows } = await client.query(
    `SELECT COALESCE(MAX((split_part(po_number, '-', 3))::int), 0) + 1 AS seq
     FROM purchase_orders WHERE po_number LIKE $1`,
    [`${prefix}%`]
  );
  const seq = rows[0].seq;
  return `${prefix}${String(seq).padStart(6, "0")}`;
}

// Recompute subtotal/tax/total from the PO's line items and persist them.
async function recomputeTotals(client, poId) {
  const sumResult = await client.query(
    "SELECT COALESCE(SUM(line_total), 0) AS subtotal FROM purchase_order_items WHERE purchase_order_id = $1",
    [poId]
  );
  const subtotal = round2(sumResult.rows[0].subtotal);
  const taxRate = await getTaxRate(client);
  const tax = round2((subtotal * taxRate) / 100);
  const total = round2(subtotal + tax);

  await client.query(
    "UPDATE purchase_orders SET subtotal = $1, tax = $2, total = $3 WHERE id = $4",
    [subtotal, tax, total, poId]
  );
  return { subtotal, tax, total };
}

function assertStatusTransition(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new ApiError(422, "Invalid purchase order status transition");
  }
}

module.exports = {
  TERMINAL,
  ALLOWED_TRANSITIONS,
  round2,
  getTaxRate,
  generatePoNumber,
  recomputeTotals,
  assertStatusTransition,
};
