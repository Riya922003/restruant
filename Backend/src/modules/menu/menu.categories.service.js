const { pool } = require("../../config/database");
const { ApiError } = require("../../utils/api-error");
const { getPagination, buildMeta, parseSort } = require("../../utils/pagination");
const { toNum } = require("../../utils/serialize");

const SORT_WHITELIST = ["name", "sort_order", "created_at"];

function mapCategory(row) {
  return {
    id: toNum(row.id),
    name: row.name,
    description: row.description,
    sort_order: toNum(row.sort_order),
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapItemBrief(row) {
  return {
    id: toNum(row.id),
    name: row.name,
    price: toNum(row.price),
    is_available: row.is_available,
    is_active: row.is_active,
  };
}

async function list(query) {
  const { page, limit, offset } = getPagination(query);
  const orderBy = parseSort(query.sort, SORT_WHITELIST, "sort_order ASC, name ASC");

  const where = [];
  const params = [];
  if (query.is_active !== "all") {
    params.push(query.is_active === "false" ? false : true);
    where.push(`is_active = $${params.length}`);
  }
  if (query.search) {
    params.push(`%${query.search}%`);
    where.push(`name ILIKE $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalResult = await pool.query(
    `SELECT count(*)::int AS total FROM menu_categories ${whereSql}`,
    params
  );
  const total = totalResult.rows[0].total;

  const rowsResult = await pool.query(
    `SELECT * FROM menu_categories ${whereSql} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { rows: rowsResult.rows.map(mapCategory), meta: buildMeta(page, limit, total) };
}

async function getById(id, { includeItems } = {}) {
  const { rows } = await pool.query("SELECT * FROM menu_categories WHERE id = $1", [id]);
  if (!rows[0]) throw new ApiError(404, "Menu category not found");
  const category = mapCategory(rows[0]);

  if (includeItems) {
    const items = await pool.query(
      "SELECT * FROM menu_items WHERE category_id = $1 ORDER BY name ASC",
      [id]
    );
    category.items = items.rows.map(mapItemBrief);
  }
  return category;
}

async function create(body) {
  const { rows } = await pool.query(
    `INSERT INTO menu_categories (name, description, sort_order, is_active)
     VALUES ($1, $2, COALESCE($3, 0), COALESCE($4, true))
     RETURNING *`,
    [body.name, body.description ?? null, body.sort_order ?? null, body.is_active ?? null]
  );
  return mapCategory(rows[0]);
}

async function update(id, body) {
  const sets = [];
  const params = [];
  for (const key of ["name", "description", "sort_order", "is_active"]) {
    if (body[key] !== undefined) {
      params.push(body[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (sets.length === 0) throw new ApiError(422, "At least one field is required");

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE menu_categories SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) throw new ApiError(404, "Menu category not found");
  return mapCategory(rows[0]);
}

// Soft delete. Blocked if the category still has active items so the menu keeps
// a valid category for them.
async function remove(id) {
  const category = await pool.query("SELECT id FROM menu_categories WHERE id = $1", [id]);
  if (!category.rows[0]) throw new ApiError(404, "Menu category not found");

  const activeItems = await pool.query(
    "SELECT 1 FROM menu_items WHERE category_id = $1 AND is_active = true LIMIT 1",
    [id]
  );
  if (activeItems.rows[0]) {
    throw new ApiError(409, "Deactivate or move active items in this category first");
  }

  await pool.query("UPDATE menu_categories SET is_active = false WHERE id = $1", [id]);
  return { success: true };
}

module.exports = { list, getById, create, update, remove };
