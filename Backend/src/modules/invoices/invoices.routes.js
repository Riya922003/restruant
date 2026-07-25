const { Router } = require("express");
const { authMiddleware } = require("../../middlewares/auth.middleware");
const { requireRole } = require("../../middlewares/rbac.middleware");
const { validate } = require("../../middlewares/validate.middleware");
const { uploadSingle } = require("../../middlewares/upload.middleware");
const {
  createSchema,
  updateSchema,
  statusSchema,
  expenseSchema,
  querySchema,
} = require("./invoices.validation");
const ctrl = require("./invoices.controller");

function mountInvoicesRoutes(parentRouter) {
  const router = Router();
  router.use(authMiddleware);

  router.get("/", requireRole("manager", "store_manager"), validate(querySchema, "query"), ctrl.list);
  router.get("/:id", requireRole("manager", "store_manager"), ctrl.getById);
  router.post("/", requireRole("manager", "store_manager"), validate(createSchema), ctrl.create);
  router.patch("/:id", requireRole("manager", "store_manager"), validate(updateSchema), ctrl.update);
  router.delete("/:id", requireRole("manager"), ctrl.remove);

  router.post("/:id/file", requireRole("manager", "store_manager"), uploadSingle("file"), ctrl.uploadFile);
  router.post("/:id/status", requireRole("manager", "store_manager"), validate(statusSchema), ctrl.setStatus);
  router.post("/:id/expense", requireRole("manager", "store_manager"), validate(expenseSchema), ctrl.generateExpense);

  parentRouter.use("/supplier-invoices", router);
}

module.exports = mountInvoicesRoutes;
