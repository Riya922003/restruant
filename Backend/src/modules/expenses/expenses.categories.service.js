const { pool } = require("../../config/database");
const { ApiError } = require("../../utils/api-error");
const { getPagination, buildMeta, parseSort } = require("../../utils/pagination");
const { toNum } = require("../../utils/serialize");
const { writeAudit } = require("../audit/audit.service");

const SORT_WHITELIST = ["name", "created_at", "updated_at"];

function mapCategory(row) {
  return {
    id: toNum(row.id),
    name: row.name,
    description: row.description,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function list(query) {
  const { page, limit, offset } = getPagination(query);
  const orderBy = parseSort(query.sort, SORT_WHITELIST, "name ASC");

  const where = [];
  const params = [];

  // Default to active-only; "all" removes the filter, "false" shows inactive.
  if (query.is_active === "all") {
    // no filter
  } else if (query.is_active === "false") {
    where.push("is_active = false");
  } else {
    where.push("is_active = true");
  }

  if (query.search) {
    params.push(`%${query.search}%`);
    where.push(`name ILIKE $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalResult = await pool.query(
    `SELECT count(*)::int AS total FROM expense_categories ${whereSql}`,
    params
  );
  const total = totalResult.rows[0].total;

  const rowsResult = await pool.query(
    `SELECT * FROM expense_categories ${whereSql} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { rows: rowsResult.rows.map(mapCategory), meta: buildMeta(page, limit, total) };
}

async function getById(id) {
  const { rows } = await pool.query("SELECT * FROM expense_categories WHERE id = $1", [id]);
  if (!rows[0]) throw new ApiError(404, "Expense category not found");
  return mapCategory(rows[0]);
}

async function create(body, user) {
  const { rows } = await pool.query(
    `INSERT INTO expense_categories (name, description, is_active)
     VALUES ($1, $2, COALESCE($3, true))
     RETURNING *`,
    [body.name, body.description ?? null, body.is_active ?? null]
  );
  const category = mapCategory(rows[0]);
  await writeAudit({
    actorUserId: user?.id,
    action: "expense_category.created",
    entityType: "expense_category",
    entityId: category.id,
    metadata: { name: category.name },
  });
  return category;
}

async function update(id, body, user) {
  const sets = [];
  const params = [];
  for (const key of ["name", "description", "is_active"]) {
    if (body[key] !== undefined) {
      params.push(body[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (sets.length === 0) throw new ApiError(422, "At least one field is required");

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE expense_categories SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) throw new ApiError(404, "Expense category not found");
  const category = mapCategory(rows[0]);
  await writeAudit({
    actorUserId: user?.id,
    action: "expense_category.updated",
    entityType: "expense_category",
    entityId: category.id,
    metadata: { changed: Object.keys(body) },
  });
  return category;
}

async function remove(id, user) {
  const { rows } = await pool.query(
    "UPDATE expense_categories SET is_active = false WHERE id = $1 RETURNING id",
    [id]
  );
  if (!rows[0]) throw new ApiError(404, "Expense category not found");
  await writeAudit({
    actorUserId: user?.id,
    action: "expense_category.deleted",
    entityType: "expense_category",
    entityId: toNum(rows[0].id),
    metadata: null,
  });
  return { success: true };
}

module.exports = { list, getById, create, update, remove };
