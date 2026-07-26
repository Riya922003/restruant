const { asyncHandler } = require("../../utils/async-handler");
const { ok, created } = require("../../utils/respond");
const { toCsv, sendCsv } = require("../../utils/csv");
const { writeAudit } = require("../audit/audit.service");
const svc = require("./suppliers.service");

const EXPORT_COLUMNS = [
  { key: "name", header: "Name" },
  { key: "contact_name", header: "Contact" },
  { key: "email", header: "Email" },
  { key: "phone", header: "Phone" },
  { key: "address", header: "Address" },
  { key: "payment_terms", header: "Payment Terms" },
  { key: "is_active", header: "Active" },
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

const exportSuppliers = asyncHandler(async (req, res) => {
  const rows = await svc.exportRows(req.query);
  const csv = toCsv(EXPORT_COLUMNS, rows);
  await writeAudit({
    actorUserId: req.user?.id,
    action: "supplier.exported",
    entityType: "supplier",
    metadata: { count: rows.length, format: "csv" },
  });
  sendCsv(res, "suppliers.csv", csv);
});

module.exports = { list, getById, create, update, remove, exportSuppliers };
