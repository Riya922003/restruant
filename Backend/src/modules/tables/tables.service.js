const { pool } = require("../../config/database");
const { ApiError } = require("../../utils/api-error");
const { getPagination, buildMeta, parseSort } = require("../../utils/pagination");
const { toNum } = require("../../utils/serialize");
const { writeAudit } = require("../audit/audit.service");

const SORT_WHITELIST = ["label", "capacity", "status", "created_at"];
const ACTIVE_ORDER_STATUSES = ["completed", "cancelled"];

function mapTable(row) {
  return {
    id: toNum(row.id),
    label: row.label,
    capacity: toNum(row.capacity),
    section: row.section,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Waiters may only change status; managers/owners may change any field.
function pickAllowedFields(role, body) {
  if (role === "waiter") {
    const allowed = {};
    if (body.status !== undefined) allowed.status = body.status;
    return allowed;
  }
  return body;
}

async function list(query) {
  const { page, limit, offset } = getPagination(query);
  const orderBy = parseSort(query.sort, SORT_WHITELIST, "created_at DESC");

  const where = [];
  const params = [];
  if (query.status) {
    params.push(query.status);
    where.push(`status = $${params.length}`);
  }
  if (query.section) {
    params.push(query.section);
    where.push(`section = $${params.length}`);
  }
  if (query.search) {
    params.push(`%${query.search}%`);
    where.push(`label ILIKE $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalResult = await pool.query(
    `SELECT count(*)::int AS total FROM restaurant_tables ${whereSql}`,
    params
  );
  const total = totalResult.rows[0].total;

  const rowsResult = await pool.query(
    `SELECT * FROM restaurant_tables ${whereSql} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { rows: rowsResult.rows.map(mapTable), meta: buildMeta(page, limit, total) };
}

async function getById(id) {
  const { rows } = await pool.query("SELECT * FROM restaurant_tables WHERE id = $1", [id]);
  if (!rows[0]) throw new ApiError(404, "Table not found");
  return mapTable(rows[0]);
}

async function create(body, user) {
  const { rows } = await pool.query(
    `INSERT INTO restaurant_tables (label, capacity, section, status)
     VALUES ($1, $2, $3, COALESCE($4::table_status, 'available'))
     RETURNING *`,
    [body.label, body.capacity, body.section ?? null, body.status ?? null]
  );
  const table = mapTable(rows[0]);
  await writeAudit({
    actorUserId: user?.id,
    action: "table.created",
    entityType: "table",
    entityId: table.id,
    metadata: { label: table.label },
  });
  return table;
}

async function update(id, body, user) {
  const fields = pickAllowedFields(user.role, body);
  if (Object.keys(fields).length === 0) {
    throw new ApiError(403, "You do not have permission to edit these fields");
  }

  const sets = [];
  const params = [];
  for (const key of ["label", "capacity", "section", "status"]) {
    if (fields[key] !== undefined) {
      params.push(fields[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (sets.length === 0) throw new ApiError(422, "At least one field is required");

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE restaurant_tables SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) throw new ApiError(404, "Table not found");
  await writeAudit({
    actorUserId: user?.id,
    action: "table.updated",
    entityType: "table",
    entityId: id,
    metadata: { changed: Object.keys(body) },
  });
  return mapTable(rows[0]);
}

async function remove(id, user) {
  const active = await pool.query(
    `SELECT 1 FROM orders
     WHERE table_id = $1 AND status <> ALL($2::order_status[]) LIMIT 1`,
    [id, ACTIVE_ORDER_STATUSES]
  );
  if (active.rows[0]) {
    throw new ApiError(409, "Table has active orders and cannot be deleted");
  }

  const { rows } = await pool.query(
    "DELETE FROM restaurant_tables WHERE id = $1 RETURNING id",
    [id]
  );
  if (!rows[0]) throw new ApiError(404, "Table not found");
  await writeAudit({
    actorUserId: user?.id,
    action: "table.deleted",
    entityType: "table",
    entityId: id,
    metadata: null,
  });
  return { success: true };
}

module.exports = { list, getById, create, update, remove };
