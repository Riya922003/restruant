const { pool } = require("../../config/database");
const { getPagination, buildMeta, parseSort } = require("../../utils/pagination");
const { toNum } = require("../../utils/serialize");

const SORT_WHITELIST = ["created_at", "action", "entity_type"];

// Append an audit row using the shared pool. A logging failure must never break
// the business action, so errors are caught and logged, not rethrown. Use this
// for non-transactional mutations (single-statement create/update/delete).
async function writeAudit({ actorUserId, action, entityType = null, entityId = null, metadata = null }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [actorUserId ?? null, action, entityType, entityId ?? null, metadata]
    );
  } catch (error) {
    console.error(`Audit write failed for "${action}":`, error.message);
  }
}

// Append an audit row on an existing transaction client so it commits or rolls
// back together with the mutation. Errors propagate here on purpose: the audit
// row is part of the unit of work. Use inside withTransaction(...) flows.
async function writeAuditTx(client, { actorUserId, action, entityType = null, entityId = null, metadata = null }) {
  await client.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorUserId ?? null, action, entityType, entityId ?? null, metadata]
  );
}

function mapRow(row) {
  return {
    id: toNum(row.id),
    actor_user_id: toNum(row.actor_user_id),
    actor_name: row.actor_name,
    actor_email: row.actor_email,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: toNum(row.entity_id),
    metadata: row.metadata,
    created_at: row.created_at,
  };
}

async function list(query) {
  const { page, limit, offset } = getPagination(query);
  const orderBy = parseSort(query.sort, SORT_WHITELIST, "created_at DESC");

  const where = [];
  const params = [];
  const filter = (sql, value) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };

  if (query.action) filter("a.action = ?", query.action);
  if (query.entity_type) filter("a.entity_type = ?", query.entity_type);
  if (query.entity_id !== undefined) filter("a.entity_id = ?", query.entity_id);
  if (query.actor_user_id !== undefined) filter("a.actor_user_id = ?", query.actor_user_id);
  if (query.from) filter("a.created_at >= ?", query.from);
  if (query.to) filter("a.created_at <= ?", query.to);

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalResult = await pool.query(
    `SELECT count(*)::int AS total FROM audit_logs a ${whereSql}`,
    params
  );
  const total = totalResult.rows[0].total;

  const rowsResult = await pool.query(
    `SELECT a.id, a.actor_user_id, a.action, a.entity_type, a.entity_id, a.metadata, a.created_at,
            u.full_name AS actor_name, u.email AS actor_email
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_user_id
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { rows: rowsResult.rows.map(mapRow), meta: buildMeta(page, limit, total) };
}

// Distinct actions and entity types, for populating the Activity Log filters.
async function facets() {
  const actions = await pool.query("SELECT DISTINCT action FROM audit_logs ORDER BY action");
  const entityTypes = await pool.query(
    "SELECT DISTINCT entity_type FROM audit_logs WHERE entity_type IS NOT NULL ORDER BY entity_type"
  );
  return {
    actions: actions.rows.map((r) => r.action),
    entity_types: entityTypes.rows.map((r) => r.entity_type),
  };
}

module.exports = { writeAudit, writeAuditTx, list, facets };
