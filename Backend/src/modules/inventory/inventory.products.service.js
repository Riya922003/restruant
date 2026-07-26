const { pool } = require("../../config/database");
const { ApiError } = require("../../utils/api-error");
const { getPagination, buildMeta, parseSort } = require("../../utils/pagination");
const { toNum } = require("../../utils/serialize");
const { writeAudit } = require("../audit/audit.service");

const SORT_WHITELIST = [
  "name",
  "sku",
  "current_stock",
  "reorder_level",
  "cost_price",
  "created_at",
  "updated_at",
];

function mapProduct(row) {
  return {
    id: toNum(row.id),
    sku: row.sku,
    name: row.name,
    category_id: toNum(row.category_id),
    unit: row.unit,
    current_stock: toNum(row.current_stock),
    reorder_level: toNum(row.reorder_level),
    cost_price: toNum(row.cost_price),
    supplier_id: toNum(row.supplier_id),
    warehouse_id: toNum(row.warehouse_id),
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Validate that a referenced row exists; throws 409 otherwise.
async function assertReference(table, id, label) {
  if (id === undefined || id === null) return;
  const { rows } = await pool.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
  if (!rows[0]) throw new ApiError(409, `Referenced ${label} not found`);
}

async function validateReferences(body) {
  if (body.category_id !== undefined) {
    await assertReference("product_categories", body.category_id, "category");
  }
  if (body.supplier_id !== undefined) {
    await assertReference("suppliers", body.supplier_id, "supplier");
  }
  if (body.warehouse_id !== undefined) {
    await assertReference("warehouses", body.warehouse_id, "warehouse");
  }
}

async function list(query) {
  const { page, limit, offset } = getPagination(query);
  const orderBy = parseSort(query.sort, SORT_WHITELIST, "created_at DESC");

  const where = [];
  const params = [];
  if (query.is_active !== "all") {
    params.push(query.is_active === "false" ? false : true);
    where.push(`is_active = $${params.length}`);
  }
  if (query.search) {
    params.push(`%${query.search}%`);
    where.push(`(sku ILIKE $${params.length} OR name ILIKE $${params.length})`);
  }
  if (query.category_id) {
    params.push(query.category_id);
    where.push(`category_id = $${params.length}`);
  }
  if (query.supplier_id) {
    params.push(query.supplier_id);
    where.push(`supplier_id = $${params.length}`);
  }
  if (query.warehouse_id) {
    params.push(query.warehouse_id);
    where.push(`warehouse_id = $${params.length}`);
  }
  if (query.low_stock === "true") {
    where.push("current_stock <= reorder_level");
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalResult = await pool.query(
    `SELECT count(*)::int AS total FROM products ${whereSql}`,
    params
  );
  const total = totalResult.rows[0].total;

  const rowsResult = await pool.query(
    `SELECT * FROM products ${whereSql} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { rows: rowsResult.rows.map(mapProduct), meta: buildMeta(page, limit, total) };
}

async function getById(id) {
  const { rows } = await pool.query("SELECT * FROM products WHERE id = $1", [id]);
  if (!rows[0]) throw new ApiError(404, "Product not found");
  return mapProduct(rows[0]);
}

async function create(body, user) {
  await validateReferences(body);

  const { rows } = await pool.query(
    `INSERT INTO products
       (sku, name, category_id, unit, current_stock, reorder_level, cost_price, supplier_id, warehouse_id, is_active)
     VALUES ($1, $2, $3, $4, COALESCE($5, 0), COALESCE($6, 0), COALESCE($7, 0), $8, $9, COALESCE($10, true))
     RETURNING *`,
    [
      body.sku,
      body.name,
      body.category_id ?? null,
      body.unit,
      body.current_stock ?? null,
      body.reorder_level ?? null,
      body.cost_price ?? null,
      body.supplier_id ?? null,
      body.warehouse_id ?? null,
      body.is_active ?? null,
    ]
  );
  await writeAudit({
    actorUserId: user?.id,
    action: "product.created",
    entityType: "product",
    entityId: rows[0].id,
    metadata: { name: rows[0].name },
  });
  return mapProduct(rows[0]);
}

async function update(id, body, user) {
  // current_stock is blocked by the schema; validate any provided FKs.
  await validateReferences(body);

  const sets = [];
  const params = [];
  for (const key of [
    "sku",
    "name",
    "category_id",
    "unit",
    "reorder_level",
    "cost_price",
    "supplier_id",
    "warehouse_id",
    "is_active",
  ]) {
    if (body[key] !== undefined) {
      params.push(body[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (sets.length === 0) throw new ApiError(422, "At least one field is required");

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE products SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) throw new ApiError(404, "Product not found");
  await writeAudit({
    actorUserId: user?.id,
    action: "product.updated",
    entityType: "product",
    entityId: rows[0].id,
    metadata: { changed: Object.keys(body) },
  });
  return mapProduct(rows[0]);
}

// Soft delete: deactivate the product (preserves the movement ledger).
async function remove(id, user) {
  const { rows } = await pool.query(
    "UPDATE products SET is_active = false WHERE id = $1 RETURNING id",
    [id]
  );
  if (!rows[0]) throw new ApiError(404, "Product not found");
  await writeAudit({
    actorUserId: user?.id,
    action: "product.deleted",
    entityType: "product",
    entityId: rows[0].id,
    metadata: null,
  });
  return { success: true };
}

module.exports = { list, getById, create, update, remove };
