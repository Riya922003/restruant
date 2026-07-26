const { pool } = require("../../config/database");
const { ApiError } = require("../../utils/api-error");
const { getPagination, buildMeta, parseSort } = require("../../utils/pagination");
const { withTransaction } = require("../../utils/with-transaction");
const { toNum } = require("../../utils/serialize");
const {
  round2,
  generatePoNumber,
  recomputeTotals,
  assertStatusTransition,
} = require("./purchases.helpers");
const { writeAuditTx } = require("../audit/audit.service");

const SORT_WHITELIST = [
  "po_number",
  "order_date",
  "expected_date",
  "total",
  "created_at",
  "updated_at",
];

function mapItem(row) {
  return {
    id: toNum(row.id),
    purchase_order_id: toNum(row.purchase_order_id),
    product_id: toNum(row.product_id),
    quantity_ordered: toNum(row.quantity_ordered),
    quantity_received: toNum(row.quantity_received),
    unit_cost: toNum(row.unit_cost),
    line_total: toNum(row.line_total),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapPo(row) {
  return {
    id: toNum(row.id),
    po_number: row.po_number,
    supplier_id: toNum(row.supplier_id),
    warehouse_id: toNum(row.warehouse_id),
    status: row.status,
    order_date: row.order_date,
    expected_date: row.expected_date,
    received_date: row.received_date,
    subtotal: toNum(row.subtotal),
    tax: toNum(row.tax),
    total: toNum(row.total),
    notes: row.notes,
    created_by: toNum(row.created_by),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function loadPo(runner, id) {
  const { rows } = await runner.query("SELECT * FROM purchase_orders WHERE id = $1", [id]);
  if (!rows[0]) throw new ApiError(404, "Purchase order not found");
  return rows[0];
}

async function assemble(runner, id) {
  const po = mapPo(await loadPo(runner, id));
  const items = await runner.query(
    "SELECT * FROM purchase_order_items WHERE purchase_order_id = $1 ORDER BY id ASC",
    [id]
  );
  po.items = items.rows.map(mapItem);
  return po;
}

async function assertSupplierActive(client, supplierId) {
  const { rows } = await client.query(
    "SELECT 1 FROM suppliers WHERE id = $1 AND is_active",
    [supplierId]
  );
  if (!rows[0]) throw new ApiError(409, "Referenced supplier not found");
}

async function assertWarehouseActive(client, warehouseId) {
  const { rows } = await client.query(
    "SELECT 1 FROM warehouses WHERE id = $1 AND is_active",
    [warehouseId]
  );
  if (!rows[0]) throw new ApiError(409, "Referenced warehouse not found");
}

async function assertProductActive(client, productId) {
  const { rows } = await client.query(
    "SELECT 1 FROM products WHERE id = $1 AND is_active",
    [productId]
  );
  if (!rows[0]) throw new ApiError(409, "Referenced product not found");
}

async function insertItem(client, poId, input) {
  const lineTotal = round2(input.quantity_ordered * input.unit_cost);
  await client.query(
    `INSERT INTO purchase_order_items
       (purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost, line_total)
     VALUES ($1, $2, $3, 0, $4, $5)`,
    [poId, input.product_id, input.quantity_ordered, input.unit_cost, lineTotal]
  );
}

async function list(query) {
  const { page, limit, offset } = getPagination(query);
  const orderBy = parseSort(query.sort, SORT_WHITELIST, "created_at DESC");

  const where = [];
  const params = [];
  if (query.supplier_id) {
    params.push(query.supplier_id);
    where.push(`supplier_id = $${params.length}`);
  }
  if (query.warehouse_id) {
    params.push(query.warehouse_id);
    where.push(`warehouse_id = $${params.length}`);
  }
  if (query.status) {
    params.push(query.status);
    where.push(`status = $${params.length}`);
  }
  if (query.search) {
    params.push(`%${query.search}%`);
    where.push(`(po_number ILIKE $${params.length} OR notes ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalResult = await pool.query(
    `SELECT count(*)::int AS total FROM purchase_orders ${whereSql}`,
    params
  );
  const total = totalResult.rows[0].total;

  const rowsResult = await pool.query(
    `SELECT * FROM purchase_orders ${whereSql} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { rows: rowsResult.rows.map(mapPo), meta: buildMeta(page, limit, total) };
}

// Same filters as list(), but no pagination and joined to supplier/warehouse
// names so the exported register is human-readable. Used by the CSV export endpoint.
async function exportRows(query) {
  const where = [];
  const params = [];
  if (query.supplier_id) {
    params.push(query.supplier_id);
    where.push(`po.supplier_id = $${params.length}`);
  }
  if (query.warehouse_id) {
    params.push(query.warehouse_id);
    where.push(`po.warehouse_id = $${params.length}`);
  }
  if (query.status) {
    params.push(query.status);
    where.push(`po.status = $${params.length}`);
  }
  if (query.search) {
    params.push(`%${query.search}%`);
    where.push(`(po.po_number ILIKE $${params.length} OR po.notes ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT po.po_number, s.name AS supplier_name, w.name AS warehouse_name, po.status,
            po.order_date, po.expected_date, po.received_date, po.subtotal, po.tax, po.total
     FROM purchase_orders po
     LEFT JOIN suppliers s ON s.id = po.supplier_id
     LEFT JOIN warehouses w ON w.id = po.warehouse_id
     ${whereSql}
     ORDER BY po.created_at DESC, po.id DESC`,
    params
  );
  return rows;
}

async function getById(id) {
  return assemble(pool, id);
}

async function create(body, user) {
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await withTransaction(async (client) => {
        await assertSupplierActive(client, body.supplier_id);
        await assertWarehouseActive(client, body.warehouse_id);
        for (const item of body.items) {
          await assertProductActive(client, item.product_id);
        }

        const poNumber = await generatePoNumber(client, year);
        const inserted = await client.query(
          `INSERT INTO purchase_orders
             (po_number, supplier_id, warehouse_id, status, order_date, expected_date, notes, created_by)
           VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7)
           RETURNING id`,
          [
            poNumber,
            body.supplier_id,
            body.warehouse_id,
            body.order_date ?? null,
            body.expected_date ?? null,
            body.notes ?? null,
            user.id,
          ]
        );
        const poId = inserted.rows[0].id;

        for (const item of body.items) {
          await insertItem(client, poId, item);
        }

        await recomputeTotals(client, poId);
        await writeAuditTx(client, {
          actorUserId: user?.id,
          action: "purchase_order.created",
          entityType: "purchase_order",
          entityId: poId,
          metadata: { supplier_id: body.supplier_id },
        });
        return assemble(client, poId);
      });
    } catch (error) {
      if (error.code === "23505" && attempt === 0) continue;
      throw error;
    }
  }
  throw new ApiError(409, "Could not allocate a purchase order number, please retry");
}

async function updateHeader(id, body) {
  return withTransaction(async (client) => {
    const po = await loadPo(client, id);

    if (body.status !== undefined && body.status !== po.status) {
      assertStatusTransition(po.status, body.status);
    }

    if (
      (body.supplier_id !== undefined || body.warehouse_id !== undefined) &&
      po.status !== "draft"
    ) {
      throw new ApiError(409, "Supplier/warehouse can only change while draft");
    }

    const movingToOrdered = body.status === "ordered" && po.status !== "ordered";
    if (movingToOrdered) {
      const count = await client.query(
        "SELECT count(*)::int AS c FROM purchase_order_items WHERE purchase_order_id = $1",
        [id]
      );
      if (count.rows[0].c < 1) {
        throw new ApiError(422, "Cannot place an empty purchase order");
      }
    }

    const sets = [];
    const params = [];
    const push = (col, value) => {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    };

    if (body.supplier_id !== undefined) push("supplier_id", body.supplier_id);
    if (body.warehouse_id !== undefined) push("warehouse_id", body.warehouse_id);
    if (body.expected_date !== undefined) push("expected_date", body.expected_date ?? null);
    if (body.notes !== undefined) push("notes", body.notes ?? null);
    if (body.status !== undefined) push("status", body.status);

    // order_date: honor explicit value; otherwise default to today when placing.
    if (body.order_date !== undefined) {
      push("order_date", body.order_date ?? null);
    } else if (movingToOrdered && !po.order_date) {
      push("order_date", new Date());
    }

    if (sets.length) {
      params.push(id);
      await client.query(
        `UPDATE purchase_orders SET ${sets.join(", ")} WHERE id = $${params.length}`,
        params
      );
    }

    return assemble(client, id);
  });
}

async function addItem(id, body) {
  return withTransaction(async (client) => {
    const po = await loadPo(client, id);
    if (po.status !== "draft") {
      throw new ApiError(409, "Line items can only be changed while the purchase order is a draft");
    }
    await assertProductActive(client, body.product_id);
    await insertItem(client, id, body);
    await recomputeTotals(client, id);
    return assemble(client, id);
  });
}

async function updateItem(id, itemId, body) {
  return withTransaction(async (client) => {
    const po = await loadPo(client, id);
    if (po.status !== "draft") {
      throw new ApiError(409, "Line items can only be changed while the purchase order is a draft");
    }

    const { rows } = await client.query(
      "SELECT * FROM purchase_order_items WHERE id = $1 AND purchase_order_id = $2",
      [itemId, id]
    );
    const item = rows[0];
    if (!item) throw new ApiError(404, "Line item not found");

    const productId = body.product_id ?? Number(item.product_id);
    if (body.product_id !== undefined && body.product_id !== Number(item.product_id)) {
      await assertProductActive(client, body.product_id);
    }

    const quantityOrdered =
      body.quantity_ordered !== undefined ? body.quantity_ordered : Number(item.quantity_ordered);
    const unitCost = body.unit_cost !== undefined ? body.unit_cost : Number(item.unit_cost);
    const lineTotal = round2(quantityOrdered * unitCost);

    await client.query(
      `UPDATE purchase_order_items
         SET product_id = $1, quantity_ordered = $2, unit_cost = $3, line_total = $4
       WHERE id = $5`,
      [productId, quantityOrdered, unitCost, lineTotal, itemId]
    );

    await recomputeTotals(client, id);
    return assemble(client, id);
  });
}

async function removeItem(id, itemId) {
  return withTransaction(async (client) => {
    const po = await loadPo(client, id);
    if (po.status !== "draft") {
      throw new ApiError(409, "Line items can only be changed while the purchase order is a draft");
    }

    const deleted = await client.query(
      "DELETE FROM purchase_order_items WHERE id = $1 AND purchase_order_id = $2 RETURNING id",
      [itemId, id]
    );
    if (!deleted.rows[0]) throw new ApiError(404, "Line item not found");

    await recomputeTotals(client, id);
    return { success: true };
  });
}

async function receive(id, body, user) {
  return withTransaction(async (client) => {
    const locked = await client.query(
      "SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE",
      [id]
    );
    const po = locked.rows[0];
    if (!po) throw new ApiError(404, "Purchase order not found");

    if (po.status !== "ordered" && po.status !== "partially_received") {
      throw new ApiError(409, "Only ordered or partially received purchase orders can be received");
    }

    for (const line of body.lines) {
      const { rows } = await client.query(
        "SELECT * FROM purchase_order_items WHERE id = $1 AND purchase_order_id = $2",
        [line.item_id, id]
      );
      const item = rows[0];
      if (!item) throw new ApiError(404, "Line item not found");

      if (Number(item.quantity_received) + line.quantity > Number(item.quantity_ordered)) {
        throw new ApiError(422, "Received quantity exceeds ordered quantity");
      }

      await client.query(
        "UPDATE purchase_order_items SET quantity_received = quantity_received + $1 WHERE id = $2",
        [line.quantity, item.id]
      );

      await client.query(
        `INSERT INTO stock_movements
           (product_id, warehouse_id, movement_type, quantity, unit_cost, reference, created_by)
         VALUES ($1, $2, 'stock_in', $3, $4, $5, $6)`,
        [item.product_id, po.warehouse_id, line.quantity, item.unit_cost, po.po_number, user.id]
      );

      await client.query(
        "UPDATE products SET current_stock = current_stock + $1 WHERE id = $2",
        [line.quantity, item.product_id]
      );
    }

    const itemsResult = await client.query(
      "SELECT quantity_ordered, quantity_received FROM purchase_order_items WHERE purchase_order_id = $1",
      [id]
    );
    const allReceived = itemsResult.rows.every(
      (r) => Number(r.quantity_received) >= Number(r.quantity_ordered)
    );

    if (allReceived) {
      await client.query(
        "UPDATE purchase_orders SET status = 'received', received_date = $1 WHERE id = $2",
        [body.received_date ?? new Date(), id]
      );
    } else {
      await client.query(
        "UPDATE purchase_orders SET status = 'partially_received' WHERE id = $1",
        [id]
      );
    }

    await writeAuditTx(client, {
      actorUserId: user?.id,
      action: "purchase_order.received",
      entityType: "purchase_order",
      entityId: id,
      metadata: { items: body.lines.length },
    });

    return assemble(client, id);
  });
}

async function remove(id) {
  const po = await loadPo(pool, id);

  if (po.status === "draft") {
    await pool.query("DELETE FROM purchase_orders WHERE id = $1", [id]);
    return { success: true };
  }
  if (po.status === "received") {
    throw new ApiError(409, "Received purchase orders cannot be cancelled");
  }
  if (po.status === "cancelled") {
    return { success: true };
  }

  await pool.query("UPDATE purchase_orders SET status = 'cancelled' WHERE id = $1", [id]);
  return { success: true };
}

module.exports = {
  list,
  getById,
  exportRows,
  create,
  updateHeader,
  addItem,
  updateItem,
  removeItem,
  receive,
  remove,
};
