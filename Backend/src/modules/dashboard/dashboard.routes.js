const { Router } = require("express");
const { authMiddleware } = require("../../middlewares/auth.middleware");
const { requireRole } = require("../../middlewares/rbac.middleware");
const { validate } = require("../../middlewares/validate.middleware");
const { querySchema } = require("./dashboard.validation");
const ctrl = require("./dashboard.controller");

// The combined summary is callable by every authenticated role; it filters the
// widgets it returns per role internally (see dashboard.service widgetsForRole).
// Per-widget endpoints use role lists matching that matrix (owner bypass applies):
const canReadSummary = requireRole("manager", "store_manager", "chef", "waiter", "cashier");
const floorRoles = requireRole("manager", "store_manager", "chef", "waiter", "cashier"); // active orders + occupancy
const stockRoles = requireRole("manager", "store_manager", "chef", "waiter"); // low stock (not cashier)
const financeRoles = requireRole("manager", "store_manager"); // all money widgets (not cashier)

function mountDashboardRoutes(parentRouter) {
  const router = Router();
  router.use(authMiddleware);

  router.get("/summary", canReadSummary, validate(querySchema, "query"), ctrl.summary);

  router.get("/active-orders", floorRoles, ctrl.activeOrders);
  router.get("/table-occupancy", floorRoles, ctrl.tableOccupancy);
  router.get("/low-stock", stockRoles, ctrl.lowStock);

  router.get("/sales", financeRoles, validate(querySchema, "query"), ctrl.sales);
  router.get("/monthly-expenses", financeRoles, ctrl.monthlyExpenses);
  router.get("/purchase-summary", financeRoles, validate(querySchema, "query"), ctrl.purchaseSummary);

  router.get("/profit", financeRoles, validate(querySchema, "query"), ctrl.profit);
  router.get("/supplier-summary", financeRoles, validate(querySchema, "query"), ctrl.supplierSummary);

  parentRouter.use("/dashboard", router);
}

module.exports = mountDashboardRoutes;
