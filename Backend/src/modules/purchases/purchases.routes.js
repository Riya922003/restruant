const { Router } = require("express");
const { authMiddleware } = require("../../middlewares/auth.middleware");
const { requireRole } = require("../../middlewares/rbac.middleware");
const { validate } = require("../../middlewares/validate.middleware");
const {
  createSchema,
  updateSchema,
  addItemSchema,
  updateItemSchema,
  receiveSchema,
  querySchema,
} = require("./purchases.validation");
const ctrl = require("./purchases.controller");

function mountPurchasesRoutes(parentRouter) {
  const router = Router();
  router.use(authMiddleware);

  router.get("/", requireRole("manager", "store_manager"), validate(querySchema, "query"), ctrl.list);
  // Static path before /:id so "export" is not captured as an id.
  router.get("/export", requireRole("manager", "store_manager"), validate(querySchema, "query"), ctrl.exportPurchases);
  router.get("/:id", requireRole("manager", "store_manager"), ctrl.getById);
  router.post("/", requireRole("manager", "store_manager"), validate(createSchema), ctrl.create);
  router.patch("/:id", requireRole("manager", "store_manager"), validate(updateSchema), ctrl.update);

  router.post(
    "/:id/items",
    requireRole("manager", "store_manager"),
    validate(addItemSchema),
    ctrl.addItem
  );
  router.patch(
    "/:id/items/:itemId",
    requireRole("manager", "store_manager"),
    validate(updateItemSchema),
    ctrl.updateItem
  );
  router.delete("/:id/items/:itemId", requireRole("manager", "store_manager"), ctrl.removeItem);

  router.post(
    "/:id/receive",
    requireRole("manager", "store_manager"),
    validate(receiveSchema),
    ctrl.receive
  );
  router.delete("/:id", requireRole("manager", "store_manager"), ctrl.remove);

  parentRouter.use("/purchase-orders", router);
}

module.exports = mountPurchasesRoutes;
