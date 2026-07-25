const { Router } = require("express");
const { authMiddleware } = require("../../middlewares/auth.middleware");
const { requireRole } = require("../../middlewares/rbac.middleware");
const { validate } = require("../../middlewares/validate.middleware");
const {
  createSchema,
  updateSchema,
  adjustStockSchema,
  querySchema,
} = require("./ingredients.validation");
const ctrl = require("./ingredients.controller");

function mountIngredientsRoutes(parentRouter) {
  const router = Router();
  router.use(authMiddleware);

  router.get("/", requireRole("manager", "chef", "store_manager"), validate(querySchema, "query"), ctrl.list);
  router.get("/:id", requireRole("manager", "chef", "store_manager"), ctrl.getById);
  router.post("/", requireRole("manager", "store_manager"), validate(createSchema), ctrl.create);
  router.patch("/:id", requireRole("manager", "chef", "store_manager"), validate(updateSchema), ctrl.update);
  router.post("/:id/adjust-stock", requireRole("manager", "chef", "store_manager"), validate(adjustStockSchema), ctrl.adjustStock);
  router.delete("/:id", requireRole("manager", "store_manager"), ctrl.remove);

  parentRouter.use("/ingredients", router);
}

module.exports = mountIngredientsRoutes;
