const { pool } = require("../../config/database");
const { ApiError } = require("../../utils/api-error");
const { getPagination, buildMeta, parseSort } = require("../../utils/pagination");
const { toNum } = require("../../utils/serialize");
const { writeAudit } = require("../audit/audit.service");

const SORT_WHITELIST = ["expense_date", "amount", "created_at"];

// expense_date is a DATE; pg returns it as a 'yyyy-mm-dd' string. Return as-is.
function mapRecord(row) {
  return {
    id: toNum(row.id),
    category_id: toNum(row.category_id),
    supplier_id: toNum(row.supplier_id),
    invoice_id: toNum(row.invoice_id),
    description: row.description,
    amount: toNum(row.amount),
    expense_date: row.expense_date,
    payment_method: row.payment_method,
    reference: row.reference,
    created_by: toNum(row.created_by),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// z.coerce.date() yields a JS Date; store as a clean yyyy-mm-dd DATE string.
function toDateString(d) {
  return d.toISOString().slice(0, 10);
}

async function assertCategoryExists(categoryId) {
  const { rows } = await pool.query("SELECT 1 FROM expense_categories WHERE id = $1", [categoryId]);
  if (!rows[0]) {
    throw new ApiError(422, "category_id references a non-existent expense category", [
      { field: "category_id", message: "category_id references a non-existent expense category" },
    ]);
  }
}

async function assertSupplierExists(supplierId) {
  const { rows } = await pool.query("SELECT 1 FROM suppliers WHERE id = $1", [supplierId]);
  if (!rows[0]) {
    throw new ApiError(422, "supplier_id references a non-existent supplier", [
      { field: "supplier_id", message: "supplier_id references a non-existent supplier" },
    ]);
  }
}

async function assertInvoiceExists(invoiceId) {
  const { rows } = await pool.query("SELECT 1 FROM supplier_invoices WHERE id = $1", [invoiceId]);
  if (!rows[0]) {
    throw new ApiError(422, "invoice_id references a non-existent supplier invoice", [
      { field: "invoice_id", message: "invoice_id references a non-existent supplier invoice" },
    ]);
  }
}

async function list(query) {
  const { page, limit, offset } = getPagination(query);
  const orderBy = parseSort(query.sort, SORT_WHITELIST, "expense_date DESC");

  const where = [];
  const params = [];

  if (query.category_id !== undefined) {
    params.push(query.category_id);
    where.push(`category_id = $${params.length}`);
  }
  if (query.supplier_id !== undefined) {
    params.push(query.supplier_id);
    where.push(`supplier_id = $${params.length}`);
  }
  if (query.invoice_id !== undefined) {
    params.push(query.invoice_id);
    where.push(`invoice_id = $${params.length}`);
  }

  const hasFromTo = query.from_date !== undefined || query.to_date !== undefined;
  if (query.from_date !== undefined) {
    params.push(toDateString(query.from_date));
    where.push(`expense_date >= $${params.length}`);
  }
  if (query.to_date !== undefined) {
    params.push(toDateString(query.to_date));
    where.push(`expense_date <= $${params.length}`);
  }
  // month filter only applies when from/to are not supplied.
  if (!hasFromTo && query.month) {
    const [y, m] = query.month.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const nextFirst = new Date(Date.UTC(y, m, 1));
    params.push(toDateString(first));
    where.push(`expense_date >= $${params.length}`);
    params.push(toDateString(nextFirst));
    where.push(`expense_date < $${params.length}`);
  }

  if (query.search) {
    params.push(`%${query.search}%`);
    where.push(`(description ILIKE $${params.length} OR reference ILIKE $${params.length})`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalResult = await pool.query(
    `SELECT count(*)::int AS total FROM expense_records ${whereSql}`,
    params
  );
  const total = totalResult.rows[0].total;

  const rowsResult = await pool.query(
    `SELECT * FROM expense_records ${whereSql} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { rows: rowsResult.rows.map(mapRecord), meta: buildMeta(page, limit, total) };
}

async function getById(id) {
  const { rows } = await pool.query("SELECT * FROM expense_records WHERE id = $1", [id]);
  if (!rows[0]) throw new ApiError(404, "Expense record not found");
  return mapRecord(rows[0]);
}

async function create(body, user) {
  await assertCategoryExists(body.category_id);
  if (body.supplier_id !== undefined && body.supplier_id !== null) {
    await assertSupplierExists(body.supplier_id);
  }
  if (body.invoice_id !== undefined && body.invoice_id !== null) {
    await assertInvoiceExists(body.invoice_id);
  }

  const { rows } = await pool.query(
    `INSERT INTO expense_records
       (category_id, supplier_id, invoice_id, description, amount, expense_date, payment_method, reference, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      body.category_id,
      body.supplier_id ?? null,
      body.invoice_id ?? null,
      body.description,
      body.amount,
      toDateString(body.expense_date),
      body.payment_method ?? null,
      body.reference ?? null,
      user.id,
    ]
  );
  const record = mapRecord(rows[0]);
  await writeAudit({
    actorUserId: user?.id,
    action: "expense.created",
    entityType: "expense",
    entityId: record.id,
    metadata: record.amount !== null ? { amount: record.amount } : {},
  });
  return record;
}

async function update(id, body, user) {
  if (body.category_id !== undefined) await assertCategoryExists(body.category_id);
  if (body.supplier_id !== undefined && body.supplier_id !== null) {
    await assertSupplierExists(body.supplier_id);
  }
  if (body.invoice_id !== undefined && body.invoice_id !== null) {
    await assertInvoiceExists(body.invoice_id);
  }

  const sets = [];
  const params = [];
  for (const key of [
    "category_id",
    "supplier_id",
    "invoice_id",
    "description",
    "amount",
    "payment_method",
    "reference",
  ]) {
    if (body[key] !== undefined) {
      params.push(body[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (body.expense_date !== undefined) {
    params.push(toDateString(body.expense_date));
    sets.push(`expense_date = $${params.length}`);
  }
  if (sets.length === 0) throw new ApiError(422, "At least one field is required");

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE expense_records SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) throw new ApiError(404, "Expense record not found");
  const record = mapRecord(rows[0]);
  await writeAudit({
    actorUserId: user?.id,
    action: "expense.updated",
    entityType: "expense",
    entityId: record.id,
    metadata: { changed: Object.keys(body) },
  });
  return record;
}

async function remove(id, user) {
  const { rows } = await pool.query(
    "DELETE FROM expense_records WHERE id = $1 RETURNING id",
    [id]
  );
  if (!rows[0]) throw new ApiError(404, "Expense record not found");
  await writeAudit({
    actorUserId: user?.id,
    action: "expense.deleted",
    entityType: "expense",
    entityId: toNum(rows[0].id),
    metadata: null,
  });
  return { success: true };
}

module.exports = { list, getById, create, update, remove };
