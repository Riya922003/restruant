const { pool } = require("../../config/database");
const { ApiError } = require("../../utils/api-error");
const { getPagination, buildMeta, parseSort } = require("../../utils/pagination");
const { withTransaction } = require("../../utils/with-transaction");
const { toNum } = require("../../utils/serialize");

const SORT_WHITELIST = ["created_at", "quantity"];

function mapMovement(row) {
  return {
    id: toNum(row.id),
    product_id: toNum(row.product_id),
    warehouse_id: toNum(row.warehouse_id),
    movement_type: row.movement_type,
    quantity: toNum(row.quantity),
    unit_cost: toNum(row.unit_cost),
    reference: row.reference,
    reason: row.reason,
    created_by: toNum(row.created_by),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Signed effect on products.current_stock for a positive quantity.
function signedDelta(movementType, quantity, direction) {
  switch (movementType) {
    case "stock_in":
    case "transfer":
      return quantity;
    case "stock_out":
    case "wastage":
      return -quantity;
    case "adjustment":
      return direction === "increase" ? quantity : -quantity;
    default:
      return 0;
  }
}

async function list(query) {
  const { page, limit, offset } = getPagination(query);
  const orderBy = parseSort(query.sort, SORT_WHITELIST, "created_at DESC");

  const where = [];
  const params = [];
  if (query.product_id) {
    params.push(query.product_id);
    where.push(`product_id = $${params.length}`);
  }
  if (query.warehouse_id) {
    params.push(query.warehouse_id);
    where.push(`warehouse_id = $${params.length}`);
  }
  if (query.movement_type) {
    params.push(query.movement_type);
    where.push(`movement_type = $${params.length}`);
  }
  if (query.search) {
    params.push(`%${query.search}%`);
    where.push(`(reference ILIKE $${params.length} OR reason ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalResult = await pool.query(
    `SELECT count(*)::int AS total FROM stock_movements ${whereSql}`,
    params
  );
  const total = totalResult.rows[0].total;

  const rowsResult = await pool.query(
    `SELECT * FROM stock_movements ${whereSql} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { rows: rowsResult.rows.map(mapMovement), meta: buildMeta(page, limit, total) };
}

async function getById(id) {
  const { rows } = await pool.query("SELECT * FROM stock_movements WHERE id = $1", [id]);
  if (!rows[0]) throw new ApiError(404, "Stock movement not found");
  return mapMovement(rows[0]);
}

// Record a movement and atomically update the product balance.
async function create(body, user) {
  return withTransaction(async (client) => {
    const productResult = await client.query(
      "SELECT id, is_active, current_stock FROM products WHERE id = $1 FOR UPDATE",
      [body.product_id]
    );
    const product = productResult.rows[0];
    if (!product || product.is_active === false) {
      throw new ApiError(409, "Product not found or inactive");
    }

    const warehouseResult = await client.query(
      "SELECT 1 FROM warehouses WHERE id = $1 AND is_active = true",
      [body.warehouse_id]
    );
    if (!warehouseResult.rows[0]) {
      throw new ApiError(409, "Warehouse not found or inactive");
    }

    const delta = signedDelta(body.movement_type, body.quantity, body.direction);
    const next = Number(product.current_stock) + delta;
    if (next < 0) {
      throw new ApiError(422, "Insufficient stock: movement would drive stock below zero");
    }

    const inserted = await client.query(
      `INSERT INTO stock_movements
         (product_id, warehouse_id, movement_type, quantity, unit_cost, reference, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        body.product_id,
        body.warehouse_id,
        body.movement_type,
        body.quantity,
        body.unit_cost ?? null,
        body.reference ?? null,
        body.reason ?? null,
        user.id,
      ]
    );

    const updated = await client.query(
      "UPDATE products SET current_stock = current_stock + $1 WHERE id = $2 RETURNING current_stock",
      [delta, body.product_id]
    );

    return {
      ...mapMovement(inserted.rows[0]),
      product_current_stock: Number(updated.rows[0].current_stock),
    };
  });
}

module.exports = { list, getById, create };
