const { Router } = require("express");
const { authMiddleware } = require("../../middlewares/auth.middleware");
const { requireRole } = require("../../middlewares/rbac.middleware");
const { validate } = require("../../middlewares/validate.middleware");
const { querySchema } = require("./dashboard.validation");
const ctrl = require("./dashboard.controller");

// Dashboard is readable by every authenticated role (spec 04). Owner bypass
// still applies inside requireRole.
const canRead = requireRole(
  "owner",
  "manager",
  "chef",
  "waiter",
  "cashier",
  "store_manager"
);

function mountDashboardRoutes(parentRouter) {
  const router = Router();
  router.use(authMiddleware);

  router.get("/summary", canRead, validate(querySchema, "query"), ctrl.summary);
  router.get("/sales", canRead, validate(querySchema, "query"), ctrl.sales);
  router.get("/active-orders", canRead, ctrl.activeOrders);
  router.get("/table-occupancy", canRead, ctrl.tableOccupancy);
  router.get("/low-stock", canRead, ctrl.lowStock);
  router.get("/monthly-expenses", canRead, ctrl.monthlyExpenses);
  router.get("/purchase-summary", canRead, validate(querySchema, "query"), ctrl.purchaseSummary);
  router.get("/profit", canRead, validate(querySchema, "query"), ctrl.profit);
  router.get("/supplier-summary", canRead, validate(querySchema, "query"), ctrl.supplierSummary);

  parentRouter.use("/dashboard", router);
}

module.exports = mountDashboardRoutes;
