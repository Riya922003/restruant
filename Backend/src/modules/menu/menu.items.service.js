const { pool } = require("../../config/database");
const { ApiError } = require("../../utils/api-error");
const { getPagination, buildMeta, parseSort } = require("../../utils/pagination");
const { toNum } = require("../../utils/serialize");

const SORT_WHITELIST = ["name", "price", "created_at"];
// Chef may only touch availability and prep-facing fields, never price.
const CHEF_FIELDS = ["is_available", "prep_time_minutes"];
const ALL_FIELDS = [
  "category_id",
  "name",
  "description",
  "price",
  "cost",
  "prep_time_minutes",
  "is_available",
  "image_url",
];

function mapItem(row) {
  return {
    id: toNum(row.id),
    category_id: toNum(row.category_id),
    name: row.name,
    description: row.description,
    price: toNum(row.price),
    cost: toNum(row.cost),
    prep_time_minutes: toNum(row.prep_time_minutes),
    is_available: row.is_available,
    is_active: row.is_active,
    image_url: row.image_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function list(query) {
  const { page, limit, offset } = getPagination(query);
  const orderBy = parseSort(query.sort, SORT_WHITELIST, "name ASC");

  const where = [];
  const params = [];
  if (query.is_active !== "all") {
    params.push(query.is_active === "false" ? false : true);
    where.push(`is_active = $${params.length}`);
  }
  if (query.category_id) {
    params.push(query.category_id);
    where.push(`category_id = $${params.length}`);
  }
  if (query.is_available !== undefined) {
    params.push(query.is_available === "true");
    where.push(`is_available = $${params.length}`);
  }
  if (query.search) {
    params.push(`%${query.search}%`);
    where.push(`name ILIKE $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalResult = await pool.query(
    `SELECT count(*)::int AS total FROM menu_items ${whereSql}`,
    params
  );
  const total = totalResult.rows[0].total;

  const rowsResult = await pool.query(
    `SELECT * FROM menu_items ${whereSql} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { rows: rowsResult.rows.map(mapItem), meta: buildMeta(page, limit, total) };
}

async function getById(id) {
  const { rows } = await pool.query("SELECT * FROM menu_items WHERE id = $1", [id]);
  if (!rows[0]) throw new ApiError(404, "Menu item not found");
  return mapItem(rows[0]);
}

async function create(body) {
  const { rows } = await pool.query(
    `INSERT INTO menu_items
       (category_id, name, description, price, cost, prep_time_minutes, is_available, image_url)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, true), $8)
     RETURNING *`,
    [
      body.category_id,
      body.name,
      body.description ?? null,
      body.price,
      body.cost ?? null,
      body.prep_time_minutes ?? null,
      body.is_available ?? null,
      body.image_url ?? null,
    ]
  );
  return mapItem(rows[0]);
}

async function update(id, body, user) {
  const allowed = user.role === "chef" ? CHEF_FIELDS : ALL_FIELDS;
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (body[key] !== undefined) {
      params.push(body[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (sets.length === 0) {
    throw new ApiError(403, "You do not have permission to edit these fields");
  }

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE menu_items SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) throw new ApiError(404, "Menu item not found");
  return mapItem(rows[0]);
}

async function setAvailability(id, isAvailable) {
  const { rows } = await pool.query(
    "UPDATE menu_items SET is_available = $1 WHERE id = $2 RETURNING *",
    [isAvailable, id]
  );
  if (!rows[0]) throw new ApiError(404, "Menu item not found");
  return mapItem(rows[0]);
}

async function remove(id) {
  const { rows } = await pool.query(
    "UPDATE menu_items SET is_active = false WHERE id = $1 RETURNING id",
    [id]
  );
  if (!rows[0]) throw new ApiError(404, "Menu item not found");
  return { success: true };
}

module.exports = { list, getById, create, update, setAvailability, remove };
