const { Router } = require("express");
const { authMiddleware } = require("../../middlewares/auth.middleware");
const { requireRole } = require("../../middlewares/rbac.middleware");
const { validate } = require("../../middlewares/validate.middleware");
const { createSchema, updateSchema, querySchema } = require("./suppliers.validation");
const ctrl = require("./suppliers.controller");

function mountSuppliersRoutes(parentRouter) {
  const router = Router();
  router.use(authMiddleware);

  router.get("/", requireRole("manager", "store_manager"), validate(querySchema, "query"), ctrl.list);
  // Static path before /:id so "export" is not captured as an id.
  router.get("/export", requireRole("manager", "store_manager"), validate(querySchema, "query"), ctrl.exportSuppliers);
  router.get("/:id", requireRole("manager", "store_manager"), ctrl.getById);
  router.post("/", requireRole("manager", "store_manager"), validate(createSchema), ctrl.create);
  router.patch("/:id", requireRole("manager", "store_manager"), validate(updateSchema), ctrl.update);
  router.delete("/:id", requireRole("manager", "store_manager"), ctrl.remove);

  parentRouter.use("/suppliers", router);
}

module.exports = mountSuppliersRoutes;
