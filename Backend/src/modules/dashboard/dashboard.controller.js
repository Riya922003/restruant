const { asyncHandler } = require("../../utils/async-handler");
const { ok } = require("../../utils/respond");
const svc = require("./dashboard.service");

// Primary endpoint: the widgets visible to the caller's role, in one payload.
const summary = asyncHandler(async (req, res) => {
  ok(res, await svc.getSummary(req.query.range, req.user.role));
});

// Per-widget endpoints echo `range` (standalone) and wrap the same widget shape.
const sales = asyncHandler(async (req, res) => {
  const boundary = await svc.resolveBoundary(req.query.range);
  ok(res, { range: req.query.range, ...(await svc.salesOverview(boundary)) });
});

const activeOrders = asyncHandler(async (_req, res) => {
  ok(res, await svc.activeOrders());
});

const tableOccupancy = asyncHandler(async (_req, res) => {
  ok(res, await svc.tableOccupancy());
});

const lowStock = asyncHandler(async (_req, res) => {
  ok(res, await svc.lowStock());
});

const monthlyExpenses = asyncHandler(async (_req, res) => {
  ok(res, await svc.monthlyExpenses());
});

const purchaseSummary = asyncHandler(async (req, res) => {
  const boundary = await svc.resolveBoundary(req.query.range);
  ok(res, { range: req.query.range, ...(await svc.purchaseSummary(boundary)) });
});

const profit = asyncHandler(async (req, res) => {
  const boundary = await svc.resolveBoundary(req.query.range);
  ok(res, { range: req.query.range, ...(await svc.profit(boundary)) });
});

const supplierSummary = asyncHandler(async (req, res) => {
  const boundary = await svc.resolveBoundary(req.query.range);
  ok(res, { range: req.query.range, ...(await svc.supplierSummary(boundary)) });
});

module.exports = {
  summary,
  sales,
  activeOrders,
  tableOccupancy,
  lowStock,
  monthlyExpenses,
  purchaseSummary,
  profit,
  supplierSummary,
};
