const { asyncHandler } = require("../../utils/async-handler");
const { ok, created } = require("../../utils/respond");
const { toCsv, sendCsv } = require("../../utils/csv");
const { writeAudit } = require("../audit/audit.service");
const svc = require("./purchases.service");

const EXPORT_COLUMNS = [
  { key: "po_number", header: "PO Number" },
  { key: "supplier_name", header: "Supplier" },
  { key: "warehouse_name", header: "Warehouse" },
  { key: "status", header: "Status" },
  { key: "order_date", header: "Order Date" },
  { key: "expected_date", header: "Expected Date" },
  { key: "received_date", header: "Received Date" },
  { key: "subtotal", header: "Subtotal" },
  { key: "tax", header: "Tax" },
  { key: "total", header: "Total" },
];

const list = asyncHandler(async (req, res) => {
  const { rows, meta } = await svc.list(req.query);
  ok(res, rows, meta);
});

const exportPurchases = asyncHandler(async (req, res) => {
  const rows = await svc.exportRows(req.query);
  const csv = toCsv(EXPORT_COLUMNS, rows);
  await writeAudit({
    actorUserId: req.user?.id,
    action: "purchase_order.exported",
    entityType: "purchase_order",
    metadata: { count: rows.length, format: "csv" },
  });
  sendCsv(res, "purchase-orders.csv", csv);
});

const getById = asyncHandler(async (req, res) => {
  ok(res, await svc.getById(req.params.id));
});

const create = asyncHandler(async (req, res) => {
  created(res, await svc.create(req.body, req.user));
});

const update = asyncHandler(async (req, res) => {
  ok(res, await svc.updateHeader(req.params.id, req.body));
});

const addItem = asyncHandler(async (req, res) => {
  created(res, await svc.addItem(req.params.id, req.body));
});

const updateItem = asyncHandler(async (req, res) => {
  ok(res, await svc.updateItem(req.params.id, req.params.itemId, req.body));
});

const removeItem = asyncHandler(async (req, res) => {
  ok(res, await svc.removeItem(req.params.id, req.params.itemId));
});

const receive = asyncHandler(async (req, res) => {
  ok(res, await svc.receive(req.params.id, req.body, req.user));
});

const remove = asyncHandler(async (req, res) => {
  ok(res, await svc.remove(req.params.id));
});

module.exports = { list, exportPurchases, getById, create, update, addItem, updateItem, removeItem, receive, remove };
