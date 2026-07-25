const { pool } = require("../../config/database");
const { ApiError } = require("../../utils/api-error");
const { getPagination, buildMeta, parseSort } = require("../../utils/pagination");
const { toNum } = require("../../utils/serialize");

const SORT_WHITELIST = ["name", "created_at", "updated_at"];

function mapSupplier(row) {
  return {
    id: toNum(row.id),
    name: row.name,
    contact_name: row.contact_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    payment_terms: row.payment_terms,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function list(query) {
  const { page, limit, offset } = getPagination(query);
  const orderBy = parseSort(query.sort, SORT_WHITELIST, "created_at DESC");

  const where = [];
  const params = [];
  // Default to active only unless "all" (no filter) or "false" is requested.
  if (query.is_active === "all") {
    // no filter
  } else if (query.is_active === "false") {
    where.push(`is_active = false`);
  } else {
    where.push(`is_active = true`);
  }
  if (query.search) {
    params.push(`%${query.search}%`);
    where.push(
      `(name ILIKE $${params.length} OR contact_name ILIKE $${params.length} OR email ILIKE $${params.length})`
    );
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalResult = await pool.query(
    `SELECT count(*)::int AS total FROM suppliers ${whereSql}`,
    params
  );
  const total = totalResult.rows[0].total;

  const rowsResult = await pool.query(
    `SELECT * FROM suppliers ${whereSql} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { rows: rowsResult.rows.map(mapSupplier), meta: buildMeta(page, limit, total) };
}

async function getById(id) {
  const { rows } = await pool.query("SELECT * FROM suppliers WHERE id = $1", [id]);
  if (!rows[0]) throw new ApiError(404, "Supplier not found");
  return mapSupplier(rows[0]);
}

async function create(body) {
  const { rows } = await pool.query(
    `INSERT INTO suppliers (name, contact_name, email, phone, address, payment_terms, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, true))
     RETURNING *`,
    [
      body.name,
      body.contact_name ?? null,
      body.email ?? null,
      body.phone ?? null,
      body.address ?? null,
      body.payment_terms ?? null,
      body.is_active ?? null,
    ]
  );
  return mapSupplier(rows[0]);
}

async function update(id, body) {
  const sets = [];
  const params = [];
  for (const key of ["name", "contact_name", "email", "phone", "address", "payment_terms", "is_active"]) {
    if (body[key] !== undefined) {
      params.push(body[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (sets.length === 0) throw new ApiError(422, "At least one field is required");

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE suppliers SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) throw new ApiError(404, "Supplier not found");
  return mapSupplier(rows[0]);
}

async function remove(id) {
  const { rows } = await pool.query(
    "UPDATE suppliers SET is_active = false WHERE id = $1 RETURNING id",
    [id]
  );
  if (!rows[0]) throw new ApiError(404, "Supplier not found");
  return { success: true };
}

module.exports = { list, getById, create, update, remove };
