const { pool } = require("../../config/database");
const { ApiError } = require("../../utils/api-error");
const { getPagination, buildMeta, parseSort } = require("../../utils/pagination");
const { withTransaction } = require("../../utils/with-transaction");
const { toNum } = require("../../utils/serialize");
const { round2, toDateString, assertInvoiceTransition } = require("./invoices.helpers");

const SORT_WHITELIST = ["invoice_date", "total", "status", "created_at"];

function mapInvoice(row) {
  return {
    id: toNum(row.id),
    invoice_number: row.invoice_number,
    supplier_id: toNum(row.supplier_id),
    invoice_date: row.invoice_date,
    due_date: row.due_date,
    subtotal: toNum(row.subtotal),
    tax: toNum(row.tax),
    total: toNum(row.total),
    status: row.status,
    file_url: row.file_url,
    ocr_raw: row.ocr_raw,
    notes: row.notes,
    created_by: toNum(row.created_by),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapItem(row) {
  return {
    id: toNum(row.id),
    invoice_id: toNum(row.invoice_id),
    product_id: toNum(row.product_id),
    description: row.description,
    quantity: toNum(row.quantity),
    unit_price: toNum(row.unit_price),
    line_total: toNum(row.line_total),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapExpense(row) {
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

async function loadInvoice(runner, id) {
  const { rows } = await runner.query("SELECT * FROM supplier_invoices WHERE id = $1", [id]);
  if (!rows[0]) throw new ApiError(404, "Supplier invoice not found");
  return rows[0];
}

async function assemble(runner, id) {
  const invoice = mapInvoice(await loadInvoice(runner, id));
  const items = await runner.query(
    "SELECT * FROM supplier_invoice_items WHERE invoice_id = $1 ORDER BY id ASC",
    [id]
  );
  invoice.items = items.rows.map(mapItem);
  return invoice;
}

async function assertSupplierExists(client, supplierId) {
  const { rows } = await client.query("SELECT 1 FROM suppliers WHERE id = $1", [supplierId]);
  if (!rows[0]) throw new ApiError(409, "Referenced supplier not found");
}

async function insertItem(client, invoiceId, input) {
  const lineTotal = round2(input.quantity * input.unit_price);
  await client.query(
    `INSERT INTO supplier_invoice_items
       (invoice_id, product_id, description, quantity, unit_price, line_total)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [invoiceId, input.product_id ?? null, input.description, input.quantity, input.unit_price, lineTotal]
  );
}

// Recompute subtotal/total from the invoice's line items plus the header tax.
async function recomputeTotals(client, invoiceId) {
  const sumResult = await client.query(
    "SELECT COALESCE(SUM(line_total), 0) AS subtotal FROM supplier_invoice_items WHERE invoice_id = $1",
    [invoiceId]
  );
  const subtotal = round2(sumResult.rows[0].subtotal);
  const taxResult = await client.query(
    "SELECT tax FROM supplier_invoices WHERE id = $1",
    [invoiceId]
  );
  const tax = round2(taxResult.rows[0].tax);
  const total = round2(subtotal + tax);
  await client.query(
    "UPDATE supplier_invoices SET subtotal = $1, total = $2 WHERE id = $3",
    [subtotal, total, invoiceId]
  );
  return { subtotal, tax, total };
}

async function list(query) {
  const { page, limit, offset } = getPagination(query);
  const orderBy = parseSort(query.sort, SORT_WHITELIST, "created_at DESC");

  const where = [];
  const params = [];
  if (query.supplier_id) {
    params.push(query.supplier_id);
    where.push(`supplier_id = $${params.length}`);
  }
  if (query.status) {
    params.push(query.status);
    where.push(`status = $${params.length}`);
  }
  if (query.from_date) {
    params.push(toDateString(query.from_date));
    where.push(`invoice_date >= $${params.length}`);
  }
  if (query.to_date) {
    params.push(toDateString(query.to_date));
    where.push(`invoice_date <= $${params.length}`);
  }
  if (query.search) {
    params.push(`%${query.search}%`);
    where.push(`(invoice_number ILIKE $${params.length} OR notes ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalResult = await pool.query(
    `SELECT count(*)::int AS total FROM supplier_invoices ${whereSql}`,
    params
  );
  const total = totalResult.rows[0].total;

  const rowsResult = await pool.query(
    `SELECT * FROM supplier_invoices ${whereSql} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { rows: rowsResult.rows.map(mapInvoice), meta: buildMeta(page, limit, total) };
}

async function getById(id) {
  return assemble(pool, id);
}

async function create(body, user) {
  return withTransaction(async (client) => {
    await assertSupplierExists(client, body.supplier_id);

    const inserted = await client.query(
      `INSERT INTO supplier_invoices
         (invoice_number, supplier_id, invoice_date, due_date, subtotal, tax, total, status, file_url, ocr_raw, notes, created_by)
       VALUES ($1, $2, $3, $4, 0, $5, 0, $6, NULL, NULL, $7, $8)
       RETURNING id`,
      [
        body.invoice_number,
        body.supplier_id,
        toDateString(body.invoice_date),
        toDateString(body.due_date),
        body.tax,
        body.status ?? "pending",
        body.notes ?? null,
        user.id,
      ]
    );
    const invoiceId = inserted.rows[0].id;

    for (const item of body.items) {
      await insertItem(client, invoiceId, item);
    }

    await recomputeTotals(client, invoiceId);
    return assemble(client, invoiceId);
  });
}

async function update(id, body, user) {
  return withTransaction(async (client) => {
    await loadInvoice(client, id);

    if (body.supplier_id !== undefined) {
      await assertSupplierExists(client, body.supplier_id);
    }

    const sets = [];
    const params = [];
    const push = (col, value) => {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    };

    if (body.invoice_number !== undefined) push("invoice_number", body.invoice_number);
    if (body.supplier_id !== undefined) push("supplier_id", body.supplier_id);
    if (body.invoice_date !== undefined) push("invoice_date", toDateString(body.invoice_date));
    if (body.due_date !== undefined) push("due_date", toDateString(body.due_date));
    if (body.tax !== undefined) push("tax", body.tax);
    if (body.notes !== undefined) push("notes", body.notes ?? null);

    if (sets.length) {
      params.push(id);
      await client.query(
        `UPDATE supplier_invoices SET ${sets.join(", ")} WHERE id = $${params.length}`,
        params
      );
    }

    if (body.items !== undefined) {
      const existing = await client.query(
        "SELECT id FROM supplier_invoice_items WHERE invoice_id = $1",
        [id]
      );
      const existingIds = new Set(existing.rows.map((r) => Number(r.id)));
      const submittedIds = new Set();

      for (const item of body.items) {
        if (item.id !== undefined) {
          if (!existingIds.has(Number(item.id))) {
            throw new ApiError(422, "Line item does not belong to this invoice");
          }
          submittedIds.add(Number(item.id));
          const lineTotal = round2(item.quantity * item.unit_price);
          await client.query(
            `UPDATE supplier_invoice_items
               SET description = $1, product_id = $2, quantity = $3, unit_price = $4, line_total = $5
             WHERE id = $6`,
            [item.description, item.product_id ?? null, item.quantity, item.unit_price, lineTotal, item.id]
          );
        } else {
          await insertItem(client, id, item);
        }
      }

      for (const existingId of existingIds) {
        if (!submittedIds.has(existingId)) {
          await client.query("DELETE FROM supplier_invoice_items WHERE id = $1", [existingId]);
        }
      }
    }

    await recomputeTotals(client, id);
    return assemble(client, id);
  });
}

async function setStatus(id, status) {
  return withTransaction(async (client) => {
    const invoice = await loadInvoice(client, id);
    assertInvoiceTransition(invoice.status, status);
    if (invoice.status === status) {
      return assemble(client, id);
    }
    await client.query("UPDATE supplier_invoices SET status = $1 WHERE id = $2", [status, id]);
    return assemble(client, id);
  });
}

async function setFile(id, fileUrl) {
  await loadInvoice(pool, id);
  await pool.query("UPDATE supplier_invoices SET file_url = $1 WHERE id = $2", [fileUrl, id]);
  return { id: toNum(id), file_url: fileUrl };
}

async function generateExpense(id, body, user) {
  return withTransaction(async (client) => {
    const invoice = await loadInvoice(client, id);

    if (invoice.status !== "verified" && invoice.status !== "paid") {
      throw new ApiError(409, "Invoice must be verified before booking as an expense");
    }

    const existing = await client.query(
      "SELECT 1 FROM expense_records WHERE invoice_id = $1",
      [id]
    );
    if (existing.rows[0]) {
      throw new ApiError(409, "An expense already exists for this invoice");
    }

    const expenseDate = body.expense_date
      ? toDateString(body.expense_date)
      : invoice.invoice_date || new Date().toISOString().slice(0, 10);

    const { rows } = await client.query(
      `INSERT INTO expense_records
         (category_id, supplier_id, invoice_id, description, amount, expense_date, payment_method, reference, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        body.category_id,
        invoice.supplier_id,
        invoice.id,
        `Invoice ${invoice.invoice_number}`,
        invoice.total,
        expenseDate,
        body.payment_method ?? null,
        body.reference ?? null,
        user.id,
      ]
    );

    return mapExpense(rows[0]);
  });
}

async function remove(id) {
  const { rows } = await pool.query(
    "DELETE FROM supplier_invoices WHERE id = $1 RETURNING id",
    [id]
  );
  if (!rows[0]) throw new ApiError(404, "Supplier invoice not found");
  return { success: true };
}

module.exports = {
  list,
  getById,
  create,
  update,
  setStatus,
  setFile,
  generateExpense,
  remove,
};
