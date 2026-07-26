const { asyncHandler } = require("../../utils/async-handler");
const { ok, created } = require("../../utils/respond");
const { toCsv, sendCsv } = require("../../utils/csv");
const { writeAudit } = require("../audit/audit.service");
const svc = require("./orders.service");

const EXPORT_COLUMNS = [
  { key: "order_number", header: "Order Number" },
  { key: "order_type", header: "Type" },
  { key: "status", header: "Status" },
  { key: "table_id", header: "Table" },
  { key: "subtotal", header: "Subtotal" },
  { key: "tax", header: "Tax" },
  { key: "discount", header: "Discount" },
  { key: "total", header: "Total" },
  { key: "payment_status", header: "Payment Status" },
  { key: "payment_method", header: "Payment Method" },
  { key: "created_at", header: "Created At" },
];

const list = asyncHandler(async (req, res) => {
  const { rows, meta } = await svc.list(req.query);
  ok(res, rows, meta);
});

const exportOrders = asyncHandler(async (req, res) => {
  const rows = await svc.exportRows(req.query);
  const csv = toCsv(EXPORT_COLUMNS, rows);
  await writeAudit({
    actorUserId: req.user?.id,
    action: "order.exported",
    entityType: "order",
    metadata: { count: rows.length, format: "csv" },
  });
  sendCsv(res, "orders.csv", csv);
});

const getById = asyncHandler(async (req, res) => {
  ok(res, await svc.getById(req.params.id));
});

const create = asyncHandler(async (req, res) => {
  created(res, await svc.create(req.body, req.user));
});

const updateHeader = asyncHandler(async (req, res) => {
  ok(res, await svc.updateHeader(req.params.id, req.body));
});

const transitionStatus = asyncHandler(async (req, res) => {
  ok(res, await svc.transitionStatus(req.params.id, req.body.status, req.user));
});

const payment = asyncHandler(async (req, res) => {
  ok(res, await svc.takePayment(req.params.id, req.body, req.user));
});

const cancel = asyncHandler(async (req, res) => {
  ok(res, await svc.cancel(req.params.id, req.user));
});

const listItems = asyncHandler(async (req, res) => {
  ok(res, await svc.listItems(req.params.id));
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

module.exports = {
  list,
  exportOrders,
  getById,
  create,
  updateHeader,
  transitionStatus,
  payment,
  cancel,
  listItems,
  addItem,
  updateItem,
  removeItem,
};
