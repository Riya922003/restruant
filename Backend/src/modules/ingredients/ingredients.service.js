const { pool } = require("../../config/database");
const { ApiError } = require("../../utils/api-error");
const { getPagination, buildMeta, parseSort } = require("../../utils/pagination");
const { toNum } = require("../../utils/serialize");
const { writeAudit } = require("../audit/audit.service");

const SORT_WHITELIST = [
  "name",
  "current_stock",
  "reorder_level",
  "cost_per_unit",
  "created_at",
  "updated_at",
];

function mapIngredient(row) {
  return {
    id: toNum(row.id),
    name: row.name,
    unit: row.unit,
    current_stock: toNum(row.current_stock),
    reorder_level: toNum(row.reorder_level),
    cost_per_unit: toNum(row.cost_per_unit),
    supplier_id: toNum(row.supplier_id),
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function assertSupplierExists(supplierId) {
  const { rows } = await pool.query("SELECT 1 FROM suppliers WHERE id = $1", [supplierId]);
  if (!rows[0]) throw new ApiError(409, "Referenced supplier not found");
}

async function list(query) {
  const { page, limit, offset } = getPagination(query);
  const orderBy = parseSort(query.sort, SORT_WHITELIST, "name ASC");

  const where = [];
  const params = [];

  if (query.is_active === "all") {
    // no is_active filter
  } else if (query.is_active === "false") {
    where.push("is_active = false");
  } else {
    where.push("is_active = true");
  }

  if (query.search) {
    params.push(`%${query.search}%`);
    where.push(`name ILIKE $${params.length}`);
  }
  if (query.supplier_id !== undefined) {
    params.push(query.supplier_id);
    where.push(`supplier_id = $${params.length}`);
  }
  if (query.low_stock === "true") {
    where.push("current_stock <= reorder_level");
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalResult = await pool.query(
    `SELECT count(*)::int AS total FROM ingredients ${whereSql}`,
    params
  );
  const total = totalResult.rows[0].total;

  const rowsResult = await pool.query(
    `SELECT * FROM ingredients ${whereSql} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { rows: rowsResult.rows.map(mapIngredient), meta: buildMeta(page, limit, total) };
}

async function getById(id) {
  const { rows } = await pool.query("SELECT * FROM ingredients WHERE id = $1", [id]);
  if (!rows[0]) throw new ApiError(404, "Ingredient not found");
  return mapIngredient(rows[0]);
}

async function create(body, user) {
  if (body.supplier_id !== undefined && body.supplier_id !== null) {
    await assertSupplierExists(body.supplier_id);
  }

  const { rows } = await pool.query(
    `INSERT INTO ingredients (name, unit, current_stock, reorder_level, cost_per_unit, supplier_id, is_active)
     VALUES ($1, $2, COALESCE($3, 0), COALESCE($4, 0), COALESCE($5, 0), $6, COALESCE($7, true))
     RETURNING *`,
    [
      body.name,
      body.unit,
      body.current_stock ?? null,
      body.reorder_level ?? null,
      body.cost_per_unit ?? null,
      body.supplier_id ?? null,
      body.is_active ?? null,
    ]
  );
  const ingredient = mapIngredient(rows[0]);
  await writeAudit({
    actorUserId: user?.id,
    action: "ingredient.created",
    entityType: "ingredient",
    entityId: ingredient.id,
    metadata: { name: body.name },
  });
  return ingredient;
}

async function update(id, body, user) {
  if (body.supplier_id !== undefined && body.supplier_id !== null) {
    await assertSupplierExists(body.supplier_id);
  }

  const sets = [];
  const params = [];
  for (const key of [
    "name",
    "unit",
    "current_stock",
    "reorder_level",
    "cost_per_unit",
    "supplier_id",
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
    `UPDATE ingredients SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) throw new ApiError(404, "Ingredient not found");
  await writeAudit({
    actorUserId: user?.id,
    action: "ingredient.updated",
    entityType: "ingredient",
    entityId: id,
    metadata: { changed: Object.keys(body) },
  });
  return mapIngredient(rows[0]);
}

async function adjustStock(id, delta, reason, user) {
  const { rows } = await pool.query(
    `UPDATE ingredients
     SET current_stock = current_stock + $1
     WHERE id = $2 AND current_stock + $1 >= 0
     RETURNING *`,
    [delta, id]
  );
  if (!rows[0]) {
    const exists = await pool.query("SELECT 1 FROM ingredients WHERE id = $1", [id]);
    if (exists.rows[0]) throw new ApiError(422, "Stock cannot go negative");
    throw new ApiError(404, "Ingredient not found");
  }
  await writeAudit({
    actorUserId: user?.id,
    action: "ingredient.stock_adjusted",
    entityType: "ingredient",
    entityId: id,
    metadata: { delta, reason },
  });
  return mapIngredient(rows[0]);
}

async function remove(id, user) {
  const { rows } = await pool.query(
    "UPDATE ingredients SET is_active = false WHERE id = $1 RETURNING id",
    [id]
  );
  if (!rows[0]) throw new ApiError(404, "Ingredient not found");
  await writeAudit({
    actorUserId: user?.id,
    action: "ingredient.deactivated",
    entityType: "ingredient",
    entityId: id,
    metadata: null,
  });
  return { success: true };
}

module.exports = { list, getById, create, update, adjustStock, remove };
