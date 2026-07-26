const { pool } = require("../../config/database");
const { ApiError } = require("../../utils/api-error");
const { getPagination, buildMeta, parseSort } = require("../../utils/pagination");
const { toNum } = require("../../utils/serialize");
const { writeAudit } = require("../audit/audit.service");

const SORT_WHITELIST = ["name", "type", "created_at", "updated_at"];

function mapWarehouse(row) {
  return {
    id: toNum(row.id),
    name: row.name,
    location: row.location,
    type: row.type,
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
  if (query.is_active !== "all") {
    params.push(query.is_active === "false" ? false : true);
    where.push(`is_active = $${params.length}`);
  }
  if (query.type) {
    params.push(query.type);
    where.push(`type = $${params.length}`);
  }
  if (query.search) {
    params.push(`%${query.search}%`);
    where.push(`(name ILIKE $${params.length} OR location ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalResult = await pool.query(
    `SELECT count(*)::int AS total FROM warehouses ${whereSql}`,
    params
  );
  const total = totalResult.rows[0].total;

  const rowsResult = await pool.query(
    `SELECT * FROM warehouses ${whereSql} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { rows: rowsResult.rows.map(mapWarehouse), meta: buildMeta(page, limit, total) };
}

async function getById(id) {
  const { rows } = await pool.query("SELECT * FROM warehouses WHERE id = $1", [id]);
  if (!rows[0]) throw new ApiError(404, "Warehouse not found");
  return mapWarehouse(rows[0]);
}

async function create(body, user) {
  const { rows } = await pool.query(
    `INSERT INTO warehouses (name, location, type, is_active)
     VALUES ($1, $2, COALESCE($3, 'store'), COALESCE($4, true))
     RETURNING *`,
    [body.name, body.location ?? null, body.type ?? null, body.is_active ?? null]
  );
  await writeAudit({
    actorUserId: user?.id,
    action: "warehouse.created",
    entityType: "warehouse",
    entityId: rows[0].id,
    metadata: { name: rows[0].name },
  });
  return mapWarehouse(rows[0]);
}

async function update(id, body, user) {
  const sets = [];
  const params = [];
  for (const key of ["name", "location", "type", "is_active"]) {
    if (body[key] !== undefined) {
      params.push(body[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (sets.length === 0) throw new ApiError(422, "At least one field is required");

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE warehouses SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) throw new ApiError(404, "Warehouse not found");
  await writeAudit({
    actorUserId: user?.id,
    action: "warehouse.updated",
    entityType: "warehouse",
    entityId: rows[0].id,
    metadata: { changed: Object.keys(body) },
  });
  return mapWarehouse(rows[0]);
}

// Soft delete: deactivate the warehouse.
async function remove(id, user) {
  const { rows } = await pool.query(
    "UPDATE warehouses SET is_active = false WHERE id = $1 RETURNING id",
    [id]
  );
  if (!rows[0]) throw new ApiError(404, "Warehouse not found");
  await writeAudit({
    actorUserId: user?.id,
    action: "warehouse.deleted",
    entityType: "warehouse",
    entityId: rows[0].id,
    metadata: null,
  });
  return { success: true };
}

module.exports = { list, getById, create, update, remove };
