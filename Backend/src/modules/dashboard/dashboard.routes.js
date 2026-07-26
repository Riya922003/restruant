const { Router } = require("express");
const { authMiddleware } = require("../../middlewares/auth.middleware");
const { requireRole } = require("../../middlewares/rbac.middleware");
const { validate } = require("../../middlewares/validate.middleware");
const { querySchema } = require("./dashboard.validation");
const ctrl = require("./dashboard.controller");

// Operational widgets + the combined summary are readable by every authenticated
// role (owner bypass applies). The summary itself filters financial widgets by
// role internally (spec 10 §11.1).
const canRead = requireRole(
  "owner",
  "manager",
  "chef",
  "waiter",
  "cashier",
  "store_manager"
);
// Financial per-widget endpoints are limited to finance-facing roles; chef and
// waiter get 403. Owner is admitted via the requireRole bypass.
const canReadFinancials = requireRole("manager", "store_manager", "cashier");

function mountDashboardRoutes(parentRouter) {
  const router = Router();
  router.use(authMiddleware);

  router.get("/summary", canRead, validate(querySchema, "query"), ctrl.summary);
  router.get("/active-orders", canRead, ctrl.activeOrders);
  router.get("/table-occupancy", canRead, ctrl.tableOccupancy);
  router.get("/low-stock", canRead, ctrl.lowStock);

  router.get("/sales", canReadFinancials, validate(querySchema, "query"), ctrl.sales);
  router.get("/monthly-expenses", canReadFinancials, ctrl.monthlyExpenses);
  router.get("/purchase-summary", canReadFinancials, validate(querySchema, "query"), ctrl.purchaseSummary);
  router.get("/profit", canReadFinancials, validate(querySchema, "query"), ctrl.profit);
  router.get("/supplier-summary", canReadFinancials, validate(querySchema, "query"), ctrl.supplierSummary);

  parentRouter.use("/dashboard", router);
}

module.exports = mountDashboardRoutes;
