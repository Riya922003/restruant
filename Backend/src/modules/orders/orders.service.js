const { pool } = require("../../config/database");
const { ApiError } = require("../../utils/api-error");
const { getPagination, buildMeta, parseSort } = require("../../utils/pagination");
const { withTransaction } = require("../../utils/with-transaction");
const { toNum } = require("../../utils/serialize");
const {
  EDITABLE_STATUSES,
  TERMINAL_STATUSES,
  round2,
  recomputeTotals,
  generateOrderNumber,
  occupyTable,
  freeTableIfUnused,
  assertTransition,
} = require("./orders.helpers");
const { ORDER_STATUSES } = require("./orders.validation");

const SORT_WHITELIST = ["created_at", "order_number", "total", "status"];

function mapItem(row) {
  return {
    id: toNum(row.id),
    order_id: toNum(row.order_id),
    menu_item_id: toNum(row.menu_item_id),
    item_name: row.item_name,
    quantity: toNum(row.quantity),
    unit_price: toNum(row.unit_price),
    line_total: toNum(row.line_total),
    notes: row.notes,
  };
}

function mapOrder(row) {
  return {
    id: toNum(row.id),
    order_number: row.order_number,
    table_id: toNum(row.table_id),
    order_type: row.order_type,
    status: row.status,
    waiter_id: toNum(row.waiter_id),
    subtotal: toNum(row.subtotal),
    tax: toNum(row.tax),
    discount: toNum(row.discount),
    total: toNum(row.total),
    payment_status: row.payment_status,
    payment_method: row.payment_method,
    notes: row.notes,
    placed_at: row.placed_at,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function loadOrder(runner, id) {
  const { rows } = await runner.query("SELECT * FROM orders WHERE id = $1", [id]);
  if (!rows[0]) throw new ApiError(404, "Order not found");
  return rows[0];
}

async function assemble(runner, id) {
  const order = mapOrder(await loadOrder(runner, id));
  const items = await runner.query(
    "SELECT * FROM order_items WHERE order_id = $1 ORDER BY id ASC",
    [id]
  );
  order.items = items.rows.map(mapItem);
  return order;
}

// Snapshot a menu item into a new order_items row. Rejects unavailable items.
async function addSnapshotItem(client, orderId, input) {
  const { rows } = await client.query(
    "SELECT id, name, price, is_active, is_available FROM menu_items WHERE id = $1",
    [input.menu_item_id]
  );
  const item = rows[0];
  if (!item) throw new ApiError(404, "Menu item not found");
  if (!item.is_active || !item.is_available) {
    throw new ApiError(409, "Menu item is not available");
  }
  const unitPrice = Number(item.price);
  const lineTotal = round2(unitPrice * input.quantity);
  await client.query(
    `INSERT INTO order_items (order_id, menu_item_id, item_name, quantity, unit_price, line_total, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [orderId, item.id, item.name, input.quantity, unitPrice, lineTotal, input.notes ?? null]
  );
}

function validateTypeAndTable(orderType, tableId) {
  if (orderType === "dine_in" && !tableId) {
    throw new ApiError(422, "table_id is required for dine_in orders");
  }
  if (orderType !== "dine_in" && tableId) {
    throw new ApiError(422, "table_id must be empty for takeaway or delivery orders");
  }
}

async function list(query) {
  const { page, limit, offset } = getPagination(query);
  const orderBy = parseSort(query.sort, SORT_WHITELIST, "created_at DESC");

  const where = [];
  const params = [];
  if (query.status) {
    const statuses = query.status.split(",").map((s) => s.trim()).filter((s) => ORDER_STATUSES.includes(s));
    if (statuses.length) {
      params.push(statuses);
      where.push(`status = ANY($${params.length}::order_status[])`);
    }
  }
  if (query.payment_status) {
    params.push(query.payment_status);
    where.push(`payment_status = $${params.length}`);
  }
  if (query.order_type) {
    params.push(query.order_type);
    where.push(`order_type = $${params.length}`);
  }
  if (query.table_id) {
    params.push(query.table_id);
    where.push(`table_id = $${params.length}`);
  }
  if (query.waiter_id) {
    params.push(query.waiter_id);
    where.push(`waiter_id = $${params.length}`);
  }
  if (query.date_from) {
    params.push(query.date_from);
    where.push(`created_at >= $${params.length}`);
  }
  if (query.date_to) {
    params.push(query.date_to);
    where.push(`created_at <= $${params.length}`);
  }
  if (query.search) {
    params.push(`%${query.search}%`);
    where.push(`order_number ILIKE $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalResult = await pool.query(
    `SELECT count(*)::int AS total FROM orders ${whereSql}`,
    params
  );
  const total = totalResult.rows[0].total;

  const rowsResult = await pool.query(
    `SELECT * FROM orders ${whereSql} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { rows: rowsResult.rows.map(mapOrder), meta: buildMeta(page, limit, total) };
}

async function getById(id) {
  return assemble(pool, id);
}

async function create(body, user) {
  const orderType = body.order_type || "dine_in";
  const tableId = body.table_id ?? null;
  validateTypeAndTable(orderType, tableId);

  const waiterId = body.waiter_id ?? (user.role === "waiter" ? user.id : null);
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await withTransaction(async (client) => {
        const orderNumber = await generateOrderNumber(client, year);
        const inserted = await client.query(
          `INSERT INTO orders (order_number, table_id, order_type, status, waiter_id, discount, notes)
           VALUES ($1, $2, $3, 'open', $4, COALESCE($5, 0), $6) RETURNING id`,
          [orderNumber, tableId, orderType, waiterId, body.discount ?? null, body.notes ?? null]
        );
        const orderId = inserted.rows[0].id;

        for (const item of body.items ?? []) {
          await addSnapshotItem(client, orderId, item);
        }

        await recomputeTotals(client, orderId, body.discount ?? 0);
        if (orderType === "dine_in") await occupyTable(client, tableId);

        return assemble(client, orderId);
      });
    } catch (error) {
      if (error.code === "23505" && attempt === 0) continue;
      throw error;
    }
  }
  throw new ApiError(409, "Could not allocate an order number, please retry");
}

async function updateHeader(id, body) {
  return withTransaction(async (client) => {
    const order = await loadOrder(client, id);
    if (TERMINAL_STATUSES.includes(order.status)) {
      throw new ApiError(409, `Order is ${order.status} and cannot be edited`);
    }

    const newType = body.order_type ?? order.order_type;
    let newTable = body.table_id !== undefined ? body.table_id : order.table_id;
    if (newType !== "dine_in") {
      if (body.table_id) throw new ApiError(422, "table_id must be empty for takeaway or delivery orders");
      newTable = null;
    }
    validateTypeAndTable(newType, newTable);

    if (order.table_id !== newTable) {
      if (order.table_id) await freeTableIfUnused(client, order.table_id, id);
      if (newTable && newType === "dine_in") await occupyTable(client, newTable);
    }

    await client.query(
      "UPDATE orders SET table_id = $1, order_type = $2, notes = COALESCE($3, notes) WHERE id = $4",
      [newTable, newType, body.notes ?? null, id]
    );

    const discount = body.discount !== undefined ? body.discount : order.discount;
    await recomputeTotals(client, id, discount);
    return assemble(client, id);
  });
}

async function transitionStatus(id, toStatus, user) {
  return withTransaction(async (client) => {
    const order = await loadOrder(client, id);
    assertTransition(order.status, toStatus, user.role);

    const sets = ["status = $1"];
    const params = [toStatus];

    if (toStatus === "sent_to_kitchen") {
      const count = await client.query(
        "SELECT count(*)::int AS c FROM order_items WHERE order_id = $1",
        [id]
      );
      if (count.rows[0].c < 1) throw new ApiError(409, "Add at least one item before sending to kitchen");
      if (!order.placed_at) sets.push("placed_at = now()");
    }

    if (toStatus === "completed") {
      if (order.payment_status !== "paid") {
        throw new ApiError(409, "Order must be paid before completion");
      }
      sets.push("completed_at = now()");
    }

    params.push(id);
    await client.query(`UPDATE orders SET ${sets.join(", ")} WHERE id = $${params.length}`, params);

    if ((toStatus === "completed" || toStatus === "cancelled") && order.order_type === "dine_in") {
      await freeTableIfUnused(client, order.table_id, id);
    }

    return assemble(client, id);
  });
}

async function assertEditable(order) {
  if (!EDITABLE_STATUSES.includes(order.status)) {
    throw new ApiError(409, `Order is not editable in status ${order.status}`);
  }
}

async function addItem(id, body) {
  return withTransaction(async (client) => {
    const order = await loadOrder(client, id);
    await assertEditable(order);
    await addSnapshotItem(client, id, body);
    await recomputeTotals(client, id, order.discount);
    return assemble(client, id);
  });
}

async function updateItem(id, itemId, body) {
  return withTransaction(async (client) => {
    const order = await loadOrder(client, id);
    await assertEditable(order);

    const { rows } = await client.query(
      "SELECT * FROM order_items WHERE id = $1 AND order_id = $2",
      [itemId, id]
    );
    const item = rows[0];
    if (!item) throw new ApiError(404, "Order item not found");

    const quantity = body.quantity ?? Number(item.quantity);
    const lineTotal = round2(Number(item.unit_price) * quantity);
    await client.query(
      "UPDATE order_items SET quantity = $1, line_total = $2, notes = COALESCE($3, notes) WHERE id = $4",
      [quantity, lineTotal, body.notes ?? null, itemId]
    );

    await recomputeTotals(client, id, order.discount);
    return assemble(client, id);
  });
}

async function removeItem(id, itemId) {
  return withTransaction(async (client) => {
    const order = await loadOrder(client, id);
    await assertEditable(order);

    const deleted = await client.query(
      "DELETE FROM order_items WHERE id = $1 AND order_id = $2 RETURNING id",
      [itemId, id]
    );
    if (!deleted.rows[0]) throw new ApiError(404, "Order item not found");

    await recomputeTotals(client, id, order.discount);
    return assemble(client, id);
  });
}

async function listItems(id) {
  await loadOrder(pool, id);
  const { rows } = await pool.query(
    "SELECT * FROM order_items WHERE order_id = $1 ORDER BY id ASC",
    [id]
  );
  return rows.map(mapItem);
}

async function takePayment(id, body) {
  return withTransaction(async (client) => {
    const order = await loadOrder(client, id);
    if (order.status === "cancelled") throw new ApiError(409, "Cannot take payment on a cancelled order");

    const paymentStatus = body.payment_status ?? "paid";
    if (paymentStatus === "refunded" && order.payment_status !== "paid") {
      throw new ApiError(409, "Only a paid order can be refunded");
    }
    if (order.payment_status === "paid" && paymentStatus === "paid") {
      throw new ApiError(409, "Order is already paid");
    }

    await recomputeTotals(client, id, order.discount);

    const sets = ["payment_method = $1", "payment_status = $2"];
    const params = [body.payment_method, paymentStatus];

    const shouldComplete = body.complete && order.status === "served" && paymentStatus === "paid";
    if (shouldComplete) sets.push("status = 'completed'", "completed_at = now()");

    params.push(id);
    await client.query(`UPDATE orders SET ${sets.join(", ")} WHERE id = $${params.length}`, params);

    if (shouldComplete && order.order_type === "dine_in") {
      await freeTableIfUnused(client, order.table_id, id);
    }

    return assemble(client, id);
  });
}

async function cancel(id, user) {
  return transitionStatus(id, "cancelled", user);
}

module.exports = {
  list,
  getById,
  create,
  updateHeader,
  transitionStatus,
  addItem,
  updateItem,
  removeItem,
  listItems,
  takePayment,
  cancel,
};
