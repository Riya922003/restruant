const { asyncHandler } = require("../../utils/async-handler");
const { ok, created } = require("../../utils/respond");
const { toCsv, sendCsv } = require("../../utils/csv");
const { writeAudit } = require("../audit/audit.service");
const categories = require("./expenses.categories.service");
const records = require("./expenses.records.service");
const monthlyService = require("./expenses.monthly.service");

const EXPENSE_EXPORT_COLUMNS = [
  { key: "expense_date", header: "Date" },
  { key: "category_name", header: "Category" },
  { key: "description", header: "Description" },
  { key: "amount", header: "Amount" },
  { key: "payment_method", header: "Payment Method" },
  { key: "supplier_name", header: "Supplier" },
  { key: "reference", header: "Reference" },
];

// ---- Expense categories ----------------------------------------------------

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

// ---- Expense records -------------------------------------------------------

const listRecords = asyncHandler(async (req, res) => {
  const { rows, meta } = await records.list(req.query);
  ok(res, rows, meta);
});

const getRecord = asyncHandler(async (req, res) => {
  ok(res, await records.getById(req.params.id));
});

const createRecord = asyncHandler(async (req, res) => {
  created(res, await records.create(req.body, req.user));
});

const updateRecord = asyncHandler(async (req, res) => {
  ok(res, await records.update(req.params.id, req.body, req.user));
});

const removeRecord = asyncHandler(async (req, res) => {
  ok(res, await records.remove(req.params.id, req.user));
});

const exportRecords = asyncHandler(async (req, res) => {
  const rows = await records.exportRows(req.query);
  const csv = toCsv(EXPENSE_EXPORT_COLUMNS, rows);
  await writeAudit({
    actorUserId: req.user?.id,
    action: "expense.exported",
    entityType: "expense",
    metadata: { count: rows.length, format: "csv" },
  });
  sendCsv(res, "expense-register.csv", csv);
});

// ---- Monthly tracking ------------------------------------------------------

const monthly = asyncHandler(async (req, res) => {
  const { rows, meta } = await monthlyService.monthly(req.query.year);
  ok(res, rows, meta);
});

const monthSummary = asyncHandler(async (req, res) => {
  const { rows, meta } = await monthlyService.monthSummary(req.query.month);
  ok(res, rows, meta);
});

module.exports = {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  removeCategory,
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  removeRecord,
  exportRecords,
  monthly,
  monthSummary,
};
