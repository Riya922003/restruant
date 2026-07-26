const { pool } = require("../../config/database");
const { ApiError } = require("../../utils/api-error");
const { getPagination, buildMeta, parseSort } = require("../../utils/pagination");
const { toNum } = require("../../utils/serialize");
const { withTransaction } = require("../../utils/with-transaction");
const { parseCsv } = require("../../utils/csv");
const { writeAudit, writeAuditTx } = require("../audit/audit.service");
const { UNITS } = require("./inventory.validation");

const SORT_WHITELIST = [
  "name",
  "sku",
  "current_stock",
  "reorder_level",
  "cost_price",
  "created_at",
  "updated_at",
];

function mapProduct(row) {
  return {
    id: toNum(row.id),
    sku: row.sku,
    name: row.name,
    category_id: toNum(row.category_id),
    unit: row.unit,
    current_stock: toNum(row.current_stock),
    reorder_level: toNum(row.reorder_level),
    cost_price: toNum(row.cost_price),
    supplier_id: toNum(row.supplier_id),
    warehouse_id: toNum(row.warehouse_id),
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Validate that a referenced row exists; throws 409 otherwise.
async function assertReference(table, id, label) {
  if (id === undefined || id === null) return;
  const { rows } = await pool.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
  if (!rows[0]) throw new ApiError(409, `Referenced ${label} not found`);
}

async function validateReferences(body) {
  if (body.category_id !== undefined) {
    await assertReference("product_categories", body.category_id, "category");
  }
  if (body.supplier_id !== undefined) {
    await assertReference("suppliers", body.supplier_id, "supplier");
  }
  if (body.warehouse_id !== undefined) {
    await assertReference("warehouses", body.warehouse_id, "warehouse");
  }
}

async function list(query) {
  const { page, limit, offset } = getPagination(query);
  const orderBy = parseSort(query.sort, SORT_WHITELIST, "created_at DESC");

  const where = [];
  const params = [];
  if (query.is_active !== "all") {
    params.push(query.is_active === "false" ? false : true);
    where.push(`is_active = $${params.length}`);
  }
  if (query.search) {
    params.push(`%${query.search}%`);
    where.push(`(sku ILIKE $${params.length} OR name ILIKE $${params.length})`);
  }
  if (query.category_id) {
    params.push(query.category_id);
    where.push(`category_id = $${params.length}`);
  }
  if (query.supplier_id) {
    params.push(query.supplier_id);
    where.push(`supplier_id = $${params.length}`);
  }
  if (query.warehouse_id) {
    params.push(query.warehouse_id);
    where.push(`warehouse_id = $${params.length}`);
  }
  if (query.low_stock === "true") {
    where.push("current_stock <= reorder_level");
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalResult = await pool.query(
    `SELECT count(*)::int AS total FROM products ${whereSql}`,
    params
  );
  const total = totalResult.rows[0].total;

  const rowsResult = await pool.query(
    `SELECT * FROM products ${whereSql} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { rows: rowsResult.rows.map(mapProduct), meta: buildMeta(page, limit, total) };
}

async function getById(id) {
  const { rows } = await pool.query("SELECT * FROM products WHERE id = $1", [id]);
  if (!rows[0]) throw new ApiError(404, "Product not found");
  return mapProduct(rows[0]);
}

// Same filters as list(), but no pagination and joined to the category name
// so the exported catalogue is human-readable. Used by the CSV export endpoint.
async function exportRows(query) {
  const where = [];
  const params = [];
  if (query.is_active !== "all") {
    params.push(query.is_active === "false" ? false : true);
    where.push(`p.is_active = $${params.length}`);
  }
  if (query.search) {
    params.push(`%${query.search}%`);
    where.push(`(p.sku ILIKE $${params.length} OR p.name ILIKE $${params.length})`);
  }
  if (query.category_id) {
    params.push(query.category_id);
    where.push(`p.category_id = $${params.length}`);
  }
  if (query.supplier_id) {
    params.push(query.supplier_id);
    where.push(`p.supplier_id = $${params.length}`);
  }
  if (query.warehouse_id) {
    params.push(query.warehouse_id);
    where.push(`p.warehouse_id = $${params.length}`);
  }
  if (query.low_stock === "true") {
    where.push("p.current_stock <= p.reorder_level");
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT p.name, p.sku, c.name AS category_name, p.unit, p.cost_price,
            p.current_stock, p.reorder_level, p.is_active
     FROM products p
     LEFT JOIN product_categories c ON c.id = p.category_id
     ${whereSql}
     ORDER BY p.name ASC, p.id ASC`,
    params
  );
  return rows;
}

async function create(body, user) {
  await validateReferences(body);

  const { rows } = await pool.query(
    `INSERT INTO products
       (sku, name, category_id, unit, current_stock, reorder_level, cost_price, supplier_id, warehouse_id, is_active)
     VALUES ($1, $2, $3, $4, COALESCE($5, 0), COALESCE($6, 0), COALESCE($7, 0), $8, $9, COALESCE($10, true))
     RETURNING *`,
    [
      body.sku,
      body.name,
      body.category_id ?? null,
      body.unit,
      body.current_stock ?? null,
      body.reorder_level ?? null,
      body.cost_price ?? null,
      body.supplier_id ?? null,
      body.warehouse_id ?? null,
      body.is_active ?? null,
    ]
  );
  await writeAudit({
    actorUserId: user?.id,
    action: "product.created",
    entityType: "product",
    entityId: rows[0].id,
    metadata: { name: rows[0].name },
  });
  return mapProduct(rows[0]);
}

async function update(id, body, user) {
  // current_stock is blocked by the schema; validate any provided FKs.
  await validateReferences(body);

  const sets = [];
  const params = [];
  for (const key of [
    "sku",
    "name",
    "category_id",
    "unit",
    "reorder_level",
    "cost_price",
    "supplier_id",
    "warehouse_id",
    "is_active",
  ]) {
    if (body[key] !== undefined) {
      params.push(body[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (sets.length === 0) throw new ApiError(422, "At least one field is required");

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE products SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) throw new ApiError(404, "Product not found");
  await writeAudit({
    actorUserId: user?.id,
    action: "product.updated",
    entityType: "product",
    entityId: rows[0].id,
    metadata: { changed: Object.keys(body) },
  });
  return mapProduct(rows[0]);
}

// Soft delete: deactivate the product (preserves the movement ledger).
async function remove(id, user) {
  const { rows } = await pool.query(
    "UPDATE products SET is_active = false WHERE id = $1 RETURNING id",
    [id]
  );
  if (!rows[0]) throw new ApiError(404, "Product not found");
  await writeAudit({
    actorUserId: user?.id,
    action: "product.deleted",
    entityType: "product",
    entityId: rows[0].id,
    metadata: null,
  });
  return { success: true };
}

// --- CSV import ----------------------------------------------------------------

// Accepts both the exported header style ("Cost Price") and plain snake_case, so
// an exported catalogue can be edited and re-imported without renaming columns.
const IMPORT_HEADER_MAP = {
  name: "name",
  sku: "sku",
  category: "category",
  "category name": "category",
  unit: "unit",
  "cost price": "cost_price",
  cost_price: "cost_price",
  "current stock": "current_stock",
  current_stock: "current_stock",
  "reorder level": "reorder_level",
  reorder_level: "reorder_level",
};

const IMPORT_COLUMNS = ["name", "sku", "category", "unit", "cost_price", "current_stock", "reorder_level"];

function normalizeImportRow(rawRow) {
  const out = {};
  for (const [rawKey, value] of Object.entries(rawRow)) {
    const field = IMPORT_HEADER_MAP[rawKey.trim().toLowerCase()];
    if (field && out[field] === undefined) out[field] = value;
  }
  return out;
}

function parseNonNegative(raw, field) {
  if (raw === undefined || raw === "") return { value: undefined };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return { error: { field, message: `${field} must be a number >= 0` } };
  return { value: n };
}

// Parse + validate every row without writing. Returns the valid rows (ready to
// insert) and a flat list of per-row errors so the UI can preview the outcome.
async function importValidate(csvText) {
  const { rows } = parseCsv(csvText);

  const cats = await pool.query("SELECT id, name FROM product_categories WHERE is_active = true");
  const catByName = new Map(cats.rows.map((c) => [c.name.trim().toLowerCase(), Number(c.id)]));
  const existing = await pool.query("SELECT sku FROM products");
  const existingSkus = new Set(existing.rows.map((r) => String(r.sku).toLowerCase()));

  const seenSkus = new Set();
  const valid = [];
  const errors = [];

  rows.forEach((raw, i) => {
    const rowNumber = i + 2; // +1 header, +1 for 1-based spreadsheet lines
    const r = normalizeImportRow(raw);
    const rowErrors = [];

    const sku = (r.sku ?? "").trim();
    const name = (r.name ?? "").trim();
    const unit = (r.unit ?? "").trim().toLowerCase();

    if (!sku) rowErrors.push({ field: "sku", message: "sku is required" });
    else if (sku.length > 100) rowErrors.push({ field: "sku", message: "sku exceeds 100 characters" });
    if (!name) rowErrors.push({ field: "name", message: "name is required" });
    else if (name.length > 200) rowErrors.push({ field: "name", message: "name exceeds 200 characters" });
    if (!unit) rowErrors.push({ field: "unit", message: "unit is required" });
    else if (!UNITS.includes(unit)) rowErrors.push({ field: "unit", message: `unit must be one of: ${UNITS.join(", ")}` });

    let categoryId = null;
    const catCell = (r.category ?? "").trim();
    if (catCell) {
      const found = catByName.get(catCell.toLowerCase());
      if (found === undefined) rowErrors.push({ field: "category", message: `category "${catCell}" not found` });
      else categoryId = found;
    }

    const cost = parseNonNegative(r.cost_price, "cost_price");
    if (cost.error) rowErrors.push(cost.error);
    const stock = parseNonNegative(r.current_stock, "current_stock");
    if (stock.error) rowErrors.push(stock.error);
    const reorder = parseNonNegative(r.reorder_level, "reorder_level");
    if (reorder.error) rowErrors.push(reorder.error);

    if (sku) {
      const key = sku.toLowerCase();
      if (existingSkus.has(key)) rowErrors.push({ field: "sku", message: `sku "${sku}" already exists` });
      else if (seenSkus.has(key)) rowErrors.push({ field: "sku", message: `sku "${sku}" is duplicated in the file` });
      seenSkus.add(key);
    }

    if (rowErrors.length) {
      rowErrors.forEach((e) => errors.push({ row: rowNumber, field: e.field, message: e.message }));
    } else {
      valid.push({
        row: rowNumber,
        data: {
          sku,
          name,
          unit,
          category_id: categoryId,
          cost_price: cost.value,
          current_stock: stock.value,
          reorder_level: reorder.value,
        },
      });
    }
  });

  return { total: rows.length, valid, errors };
}

// Validate then insert all rows in one transaction. All-or-nothing: if any row is
// invalid, nothing is written and the errors are returned for the user to fix.
async function importCommit(csvText, user) {
  const report = await importValidate(csvText);
  if (report.errors.length > 0) {
    throw new ApiError(
      422,
      `Import rejected: ${report.errors.length} invalid row(s). Fix them and retry.`,
      report.errors.map((e) => ({ field: `row ${e.row}${e.field ? ` / ${e.field}` : ""}`, message: e.message }))
    );
  }
  if (report.valid.length === 0) throw new ApiError(422, "The file has no data rows to import");

  try {
    return await withTransaction(async (client) => {
      for (const { data } of report.valid) {
        await client.query(
          `INSERT INTO products (sku, name, category_id, unit, current_stock, reorder_level, cost_price, is_active)
           VALUES ($1, $2, $3, $4, COALESCE($5, 0), COALESCE($6, 0), COALESCE($7, 0), true)`,
          [data.sku, data.name, data.category_id, data.unit, data.current_stock ?? null, data.reorder_level ?? null, data.cost_price ?? null]
        );
      }
      await writeAuditTx(client, {
        actorUserId: user?.id,
        action: "product.imported",
        entityType: "product",
        metadata: { count: report.valid.length },
      });
      return { imported: report.valid.length };
    });
  } catch (e) {
    if (e && e.code === "23505") {
      throw new ApiError(409, "A SKU in the file was created concurrently. Re-run the import.");
    }
    throw e;
  }
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  exportRows,
  importValidate,
  importCommit,
  IMPORT_COLUMNS,
};
