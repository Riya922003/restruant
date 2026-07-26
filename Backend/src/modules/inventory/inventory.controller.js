const { asyncHandler } = require("../../utils/async-handler");
const { ok, created } = require("../../utils/respond");
const { ApiError } = require("../../utils/api-error");
const { toCsv, sendCsv } = require("../../utils/csv");
const { writeAudit } = require("../audit/audit.service");
const categories = require("./inventory.categories.service");
const products = require("./inventory.products.service");
const warehouses = require("./inventory.warehouses.service");
const movements = require("./inventory.movements.service");

const PRODUCT_EXPORT_COLUMNS = [
  { key: "name", header: "Name" },
  { key: "sku", header: "SKU" },
  { key: "category_name", header: "Category" },
  { key: "unit", header: "Unit" },
  { key: "cost_price", header: "Cost Price" },
  { key: "current_stock", header: "Current Stock" },
  { key: "reorder_level", header: "Reorder Level" },
  { key: "is_active", header: "Active" },
];

// ---- Product categories -------------------------------------------------

const listCategories = asyncHandler(async (req, res) => {
  const { rows, meta } = await categories.list(req.query);
  ok(res, rows, meta);
});

const getCategory = asyncHandler(async (req, res) => {
  ok(res, await categories.getById(req.params.id));
});

const createCategory = asyncHandler(async (req, res) => {
  created(res, await categories.create(req.body, req.user));
});

const updateCategory = asyncHandler(async (req, res) => {
  ok(res, await categories.update(req.params.id, req.body, req.user));
});

const removeCategory = asyncHandler(async (req, res) => {
  ok(res, await categories.remove(req.params.id, req.user));
});

// ---- Products -----------------------------------------------------------

const listProducts = asyncHandler(async (req, res) => {
  const { rows, meta } = await products.list(req.query);
  ok(res, rows, meta);
});

const getProduct = asyncHandler(async (req, res) => {
  ok(res, await products.getById(req.params.id));
});

const createProduct = asyncHandler(async (req, res) => {
  created(res, await products.create(req.body, req.user));
});

const updateProduct = asyncHandler(async (req, res) => {
  ok(res, await products.update(req.params.id, req.body, req.user));
});

const removeProduct = asyncHandler(async (req, res) => {
  ok(res, await products.remove(req.params.id, req.user));
});

const exportProducts = asyncHandler(async (req, res) => {
  const rows = await products.exportRows(req.query);
  const csv = toCsv(PRODUCT_EXPORT_COLUMNS, rows);
  await writeAudit({
    actorUserId: req.user?.id,
    action: "product.exported",
    entityType: "product",
    metadata: { count: rows.length, format: "csv" },
  });
  sendCsv(res, "products.csv", csv);
});

// Dry run: validate an uploaded CSV and report the outcome without writing.
const importProductsPreview = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(422, "No CSV file uploaded");
  const report = await products.importValidate(req.file.buffer.toString("utf8"));
  ok(res, {
    total: report.total,
    valid_count: report.valid.length,
    error_count: report.errors.length,
    errors: report.errors.slice(0, 200),
    preview: report.valid.slice(0, 50).map((v) => ({ row: v.row, ...v.data })),
  });
});

// Commit: validate then insert all rows in one transaction (all-or-nothing).
const importProducts = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(422, "No CSV file uploaded");
  created(res, await products.importCommit(req.file.buffer.toString("utf8"), req.user));
});

const productImportTemplate = asyncHandler(async (_req, res) => {
  const cols = products.IMPORT_COLUMNS.map((k) => ({ key: k, header: k }));
  const example = [
    {
      name: "Basmati Rice 5kg",
      sku: "RICE-5KG",
      category: "",
      unit: "pack",
      cost_price: "450",
      current_stock: "20",
      reorder_level: "5",
    },
  ];
  sendCsv(res, "products-import-template.csv", toCsv(cols, example));
});

// ---- Warehouses ---------------------------------------------------------

const listWarehouses = asyncHandler(async (req, res) => {
  const { rows, meta } = await warehouses.list(req.query);
  ok(res, rows, meta);
});

const getWarehouse = asyncHandler(async (req, res) => {
  ok(res, await warehouses.getById(req.params.id));
});

const createWarehouse = asyncHandler(async (req, res) => {
  created(res, await warehouses.create(req.body, req.user));
});

const updateWarehouse = asyncHandler(async (req, res) => {
  ok(res, await warehouses.update(req.params.id, req.body, req.user));
});

const removeWarehouse = asyncHandler(async (req, res) => {
  ok(res, await warehouses.remove(req.params.id, req.user));
});

// ---- Stock movements ----------------------------------------------------

const listMovements = asyncHandler(async (req, res) => {
  const { rows, meta } = await movements.list(req.query);
  ok(res, rows, meta);
});

const getMovement = asyncHandler(async (req, res) => {
  ok(res, await movements.getById(req.params.id));
});

const createMovement = asyncHandler(async (req, res) => {
  created(res, await movements.create(req.body, req.user));
});

module.exports = {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  removeCategory,
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  removeProduct,
  exportProducts,
  importProductsPreview,
  importProducts,
  productImportTemplate,
  listWarehouses,
  getWarehouse,
  createWarehouse,
  updateWarehouse,
  removeWarehouse,
  listMovements,
  getMovement,
  createMovement,
};
