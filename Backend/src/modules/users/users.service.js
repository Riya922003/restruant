const { pool } = require("../../config/database");
const { ApiError } = require("../../utils/api-error");
const { getPagination, buildMeta, parseSort } = require("../../utils/pagination");
const { hashPassword } = require("../../utils/password");
const { writeAudit } = require("../audit/audit.service");

const SORT_WHITELIST = [
  "full_name",
  "email",
  "role",
  "is_active",
  "created_at",
  "last_login_at",
];

// Full admin view of a user. password_hash is never included so it cannot leak
// through any response path.
function toPublicUser(row) {
  return {
    id: Number(row.id),
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    phone: row.phone,
    is_active: row.is_active,
    last_login_at: row.last_login_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Ownership / self rules (spec 09 §6, §7). Enforced here because they depend on
// the loaded target row plus the acting user. Owner bypasses everything except
// the self-deactivate guard, which protects every account from lockout.
function assertCanManage(actor, targetRow, patch = {}) {
  const isSelf = Number(actor.id) === Number(targetRow.id);

  if (actor.role !== "owner" && targetRow.role === "owner") {
    throw new ApiError(403, "Managers cannot modify an owner account");
  }
  if (patch.role === "owner" && actor.role !== "owner") {
    throw new ApiError(403, "Only an owner can assign the owner role");
  }
  if (isSelf && patch.is_active === false) {
    throw new ApiError(403, "You cannot deactivate your own account");
  }
  if (
    isSelf &&
    patch.role &&
    patch.role !== targetRow.role &&
    actor.role !== "owner"
  ) {
    throw new ApiError(403, "You cannot change your own role");
  }
}

async function loadUser(id) {
  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  if (!rows[0]) throw new ApiError(404, "User not found");
  return rows[0];
}

async function list(query) {
  const { page, limit, offset } = getPagination(query);
  const orderBy = parseSort(query.sort, SORT_WHITELIST, "created_at DESC");

  const where = [];
  const params = [];
  if (query.role) {
    params.push(query.role);
    where.push(`role = $${params.length}`);
  }
  if (query.is_active === "true" || query.is_active === "false") {
    params.push(query.is_active === "true");
    where.push(`is_active = $${params.length}`);
  }
  if (query.search) {
    params.push(`%${query.search}%`);
    where.push(
      `(full_name ILIKE $${params.length} OR email ILIKE $${params.length})`
    );
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalResult = await pool.query(
    `SELECT count(*)::int AS total FROM users ${whereSql}`,
    params
  );
  const total = totalResult.rows[0].total;

  const rowsResult = await pool.query(
    `SELECT * FROM users ${whereSql} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { rows: rowsResult.rows.map(toPublicUser), meta: buildMeta(page, limit, total) };
}

async function getById(id) {
  return toPublicUser(await loadUser(id));
}

async function create(body, actor) {
  // Only owners can mint owners (spec §6 rule 2). Checked before hashing.
  assertCanManage(actor, { id: 0, role: "none" }, { role: body.role });

  const passwordHash = await hashPassword(body.password);
  const { rows } = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role, phone, is_active)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING *`,
    [body.full_name, body.email, passwordHash, body.role, body.phone ?? null]
  );
  await writeAudit({
    actorUserId: actor?.id,
    action: "user.created",
    entityType: "user",
    entityId: rows[0].id,
    metadata: { role: rows[0].role },
  });
  return toPublicUser(rows[0]);
}

async function update(id, patch, actor) {
  const target = await loadUser(id);
  assertCanManage(actor, target, patch);

  const sets = [];
  const params = [];
  for (const key of ["full_name", "phone", "role", "is_active"]) {
    if (patch[key] !== undefined) {
      params.push(patch[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (sets.length === 0) throw new ApiError(422, "At least one field must be provided");

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE users SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );
  await writeAudit({
    actorUserId: actor?.id,
    action: "user.updated",
    entityType: "user",
    entityId: rows[0].id,
    metadata: { changed: Object.keys(patch).filter((key) => key !== "password") },
  });
  return toPublicUser(rows[0]);
}

async function resetPassword(id, newPassword, actor) {
  const target = await loadUser(id);
  // A manager may not reset an owner's password (spec §7).
  assertCanManage(actor, target);

  const passwordHash = await hashPassword(newPassword);
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, id]);
  await writeAudit({
    actorUserId: actor?.id,
    action: "user.password_reset",
    entityType: "user",
    entityId: target.id,
    metadata: null,
  });
  return { success: true };
}

async function remove(id, actor) {
  const target = await loadUser(id);
  // DELETE maps to is_active = false, so it is subject to the same guards.
  assertCanManage(actor, target, { is_active: false });

  await pool.query("UPDATE users SET is_active = false WHERE id = $1", [id]);
  await writeAudit({
    actorUserId: actor?.id,
    action: "user.deactivated",
    entityType: "user",
    entityId: target.id,
    metadata: null,
  });
  return { success: true };
}

module.exports = { list, getById, create, update, resetPassword, remove, toPublicUser };
