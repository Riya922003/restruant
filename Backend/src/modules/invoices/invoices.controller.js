const { asyncHandler } = require("../../utils/async-handler");
const { ok, created } = require("../../utils/respond");
const { ApiError } = require("../../utils/api-error");
const { toCsv, sendCsv } = require("../../utils/csv");
const { writeAudit } = require("../audit/audit.service");
const svc = require("./invoices.service");

const EXPORT_COLUMNS = [
  { key: "invoice_number", header: "Invoice Number" },
  { key: "supplier_name", header: "Supplier" },
  { key: "invoice_date", header: "Invoice Date" },
  { key: "due_date", header: "Due Date" },
  { key: "subtotal", header: "Subtotal" },
  { key: "tax", header: "Tax" },
  { key: "total", header: "Total" },
  { key: "status", header: "Status" },
];

const list = asyncHandler(async (req, res) => {
  const { rows, meta } = await svc.list(req.query);
  ok(res, rows, meta);
});

const getById = asyncHandler(async (req, res) => {
  ok(res, await svc.getById(req.params.id));
});

const create = asyncHandler(async (req, res) => {
  created(res, await svc.create(req.body, req.user));
});

const update = asyncHandler(async (req, res) => {
  ok(res, await svc.update(req.params.id, req.body, req.user));
});

const remove = asyncHandler(async (req, res) => {
  ok(res, await svc.remove(req.params.id, req.user));
});

const exportInvoices = asyncHandler(async (req, res) => {
  const rows = await svc.exportRows(req.query);
  const csv = toCsv(EXPORT_COLUMNS, rows);
  await writeAudit({
    actorUserId: req.user?.id,
    action: "supplier_invoice.exported",
    entityType: "supplier_invoice",
    metadata: { count: rows.length, format: "csv" },
  });
  sendCsv(res, "supplier-invoices.csv", csv);
});

const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(422, "No file uploaded");
  ok(res, await svc.setFile(req.params.id, `/uploads/${req.file.filename}`));
});

const setStatus = asyncHandler(async (req, res) => {
  ok(res, await svc.setStatus(req.params.id, req.body.status));
});

const generateExpense = asyncHandler(async (req, res) => {
  created(res, await svc.generateExpense(req.params.id, req.body, req.user));
});

module.exports = { list, getById, create, update, remove, exportInvoices, uploadFile, setStatus, generateExpense };
