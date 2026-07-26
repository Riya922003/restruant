const { Router } = require("express");
const { authMiddleware } = require("../../middlewares/auth.middleware");
const { requireRole } = require("../../middlewares/rbac.middleware");
const { validate } = require("../../middlewares/validate.middleware");
const v = require("./orders.validation");
const ctrl = require("./orders.controller");

const READ_ROLES = ["manager", "chef", "waiter", "cashier"];
const WAITER_WRITE = ["manager", "waiter"];

function mountOrdersRoutes(parentRouter) {
  const router = Router();
  router.use(authMiddleware);

  router.get("/", requireRole(...READ_ROLES), validate(v.querySchema, "query"), ctrl.list);
  // Static path before /:id so "export" is not captured as an id.
  router.get("/export", requireRole(...READ_ROLES), validate(v.querySchema, "query"), ctrl.exportOrders);
  router.get("/:id", requireRole(...READ_ROLES), ctrl.getById);
  router.post("/", requireRole(...WAITER_WRITE), validate(v.createSchema), ctrl.create);
  router.patch("/:id", requireRole(...WAITER_WRITE), validate(v.headerUpdateSchema), ctrl.updateHeader);
  router.patch("/:id/status", requireRole("manager", "chef", "waiter"), validate(v.statusSchema), ctrl.transitionStatus);
  router.post("/:id/payment", requireRole("manager", "cashier"), validate(v.paymentSchema), ctrl.payment);
  router.delete("/:id", requireRole("manager"), ctrl.cancel);

  router.get("/:id/items", requireRole(...READ_ROLES), ctrl.listItems);
  router.post("/:id/items", requireRole(...WAITER_WRITE), validate(v.orderItemInput), ctrl.addItem);
  router.patch("/:id/items/:itemId", requireRole(...WAITER_WRITE), validate(v.itemUpdateSchema), ctrl.updateItem);
  router.delete("/:id/items/:itemId", requireRole(...WAITER_WRITE), ctrl.removeItem);

  parentRouter.use("/orders", router);
}

module.exports = mountOrdersRoutes;
