const { insert, round2, randInt, pick, chance, daysAgo } = require("./helpers");

// Orders and their line items. Totals are computed from the items and the
// profile tax rate, matching how the API recomputes them. Item name and unit
// price are snapshotted so historical orders stay stable if the menu changes.
// Older orders are completed and paid; a batch of same-day orders is left in
// active kitchen statuses and marks its dining tables occupied.

const ACTIVE_STATUSES = ["open", "sent_to_kitchen", "preparing", "ready", "served"];
const ORDER_TYPES = ["dine_in", "dine_in", "dine_in", "takeaway", "delivery"];
const PAID_METHODS = ["cash", "card", "upi"];

function buildLines(ctx) {
  const count = randInt(ctx.rng, 2, 5);
  const chosen = new Set();
  const lines = [];
  while (lines.length < count) {
    const item = pick(ctx.rng, ctx.menuItems);
    if (chosen.has(item.id)) continue;
    chosen.add(item.id);
    const quantity = randInt(ctx.rng, 1, 3);
    lines.push({
      menu_item_id: item.id,
      item_name: item.name,
      unit_price: item.price,
      quantity,
      line_total: round2(item.price * quantity),
    });
  }
  return lines;
}

async function insertOrderWithLines(client, ctx, options) {
  const { createdAt, status, orderType, tableId, paymentStatus } = options;
  const lines = buildLines(ctx);

  const subtotal = round2(lines.reduce((sum, l) => sum + l.line_total, 0));
  const discount = chance(ctx.rng, 0.15) ? round2(subtotal * 0.05) : 0;
  const tax = round2(((subtotal - discount) * ctx.taxRate) / 100);
  const total = round2(subtotal - discount + tax);

  const year = createdAt.getFullYear();
  const orderNumber = `ORD-${year}-${String(ctx.orderSeq).padStart(6, "0")}`;
  ctx.orderSeq += 1;

  const placedAt = status === "open" ? null : createdAt;
  const completedAt = status === "completed"
    ? new Date(createdAt.getTime() + 60 * 60 * 1000)
    : null;
  const paymentMethod = paymentStatus === "paid" ? pick(ctx.rng, PAID_METHODS) : null;

  const { id: orderId } = await insert(client, "orders", {
    order_number: orderNumber,
    table_id: tableId,
    order_type: orderType,
    status,
    waiter_id: pick(ctx.rng, ctx.users.waiters),
    subtotal,
    tax,
    discount,
    total,
    payment_status: paymentStatus,
    payment_method: paymentMethod,
    notes: null,
    placed_at: placedAt,
    completed_at: completedAt,
    created_at: createdAt,
  });
  ctx.orderCount += 1;

  for (const line of lines) {
    await insert(client, "order_items", { order_id: orderId, ...line });
    ctx.orderItemCount += 1;
  }
}

async function seedOrders(client, ctx) {
  ctx.orderSeq = 1;
  ctx.orderCount = 0;
  ctx.orderItemCount = 0;

  // Historical orders: completed and paid, with a few cancellations.
  for (let i = 0; i < 44; i += 1) {
    const createdAt = daysAgo(ctx.asOf, randInt(ctx.rng, 2, 60));
    createdAt.setHours(randInt(ctx.rng, 11, 22), randInt(ctx.rng, 0, 59), 0, 0);
    const cancelled = chance(ctx.rng, 0.12);
    const orderType = pick(ctx.rng, ORDER_TYPES);
    const tableId = orderType === "dine_in" ? pick(ctx.rng, ctx.tables).id : null;
    await insertOrderWithLines(client, ctx, {
      createdAt,
      status: cancelled ? "cancelled" : "completed",
      orderType,
      tableId,
      paymentStatus: cancelled ? "unpaid" : "paid",
    });
  }

  // Active same-day orders on distinct tables, left in kitchen statuses.
  const occupiedTables = [];
  for (let i = 0; i < 8; i += 1) {
    const createdAt = daysAgo(ctx.asOf, 0);
    createdAt.setHours(randInt(ctx.rng, 10, 21), randInt(ctx.rng, 0, 59), 0, 0);
    const table = ctx.tables[i];
    occupiedTables.push(table.id);
    await insertOrderWithLines(client, ctx, {
      createdAt,
      status: ACTIVE_STATUSES[i % ACTIVE_STATUSES.length],
      orderType: "dine_in",
      tableId: table.id,
      paymentStatus: "unpaid",
    });
  }

  await client.query(
    "UPDATE restaurant_tables SET status = 'occupied' WHERE id = ANY($1::bigint[])",
    [occupiedTables]
  );
}

module.exports = { seedOrders };
