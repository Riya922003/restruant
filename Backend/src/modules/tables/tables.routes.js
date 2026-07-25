const { Router } = require("express");
const { authMiddleware } = require("../../middlewares/auth.middleware");
const { requireRole } = require("../../middlewares/rbac.middleware");
const { validate } = require("../../middlewares/validate.middleware");
const { createSchema, updateSchema, querySchema } = require("./tables.validation");
const ctrl = require("./tables.controller");

function mountTablesRoutes(parentRouter) {
  const router = Router();
  router.use(authMiddleware);

  router.get("/", requireRole("manager", "chef", "waiter", "cashier"), validate(querySchema, "query"), ctrl.list);
  router.get("/:id", requireRole("manager", "chef", "waiter", "cashier"), ctrl.getById);
  router.post("/", requireRole("manager"), validate(createSchema), ctrl.create);
  router.patch("/:id", requireRole("manager", "waiter"), validate(updateSchema), ctrl.update);
  router.delete("/:id", requireRole("manager"), ctrl.remove);

  parentRouter.use("/tables", router);
}

module.exports = mountTablesRoutes;
