const { Router } = require("express");
const { authMiddleware } = require("../../middlewares/auth.middleware");
const { requireRole } = require("../../middlewares/rbac.middleware");
const { validate } = require("../../middlewares/validate.middleware");
const v = require("./expenses.validation");
const ctrl = require("./expenses.controller");

function mountExpensesRoutes(parentRouter) {
  // Expense categories
  const categories = Router();
  categories.use(authMiddleware);
  categories.get("/", requireRole("manager", "store_manager"), validate(v.categoryQuerySchema, "query"), ctrl.listCategories);
  categories.get("/:id", requireRole("manager", "store_manager"), ctrl.getCategory);
  categories.post("/", requireRole("manager"), validate(v.categoryCreateSchema), ctrl.createCategory);
  categories.patch("/:id", requireRole("manager", "store_manager"), validate(v.categoryUpdateSchema), ctrl.updateCategory);
  categories.delete("/:id", requireRole("manager"), ctrl.removeCategory);
  parentRouter.use("/expense-categories", categories);

  // Expense records
  const records = Router();
  records.use(authMiddleware);
  records.get("/", requireRole("manager", "cashier", "store_manager"), validate(v.recordQuerySchema, "query"), ctrl.listRecords);
  // Static path before /:id so "export" is not captured as an id.
  records.get("/export", requireRole("manager", "cashier", "store_manager"), validate(v.recordQuerySchema, "query"), ctrl.exportRecords);
  records.get("/:id", requireRole("manager", "cashier", "store_manager"), ctrl.getRecord);
  records.post("/", requireRole("manager", "store_manager"), validate(v.recordCreateSchema), ctrl.createRecord);
  records.patch("/:id", requireRole("manager", "store_manager"), validate(v.recordUpdateSchema), ctrl.updateRecord);
  records.delete("/:id", requireRole("manager"), ctrl.removeRecord);
  parentRouter.use("/expense-records", records);

  // Monthly tracking (read-only aggregation)
  const monthly = Router();
  monthly.use(authMiddleware);
  monthly.get("/monthly", requireRole("manager", "cashier", "store_manager"), validate(v.monthlyQuerySchema, "query"), ctrl.monthly);
  monthly.get("/monthly/summary", requireRole("manager", "cashier", "store_manager"), validate(v.monthSummaryQuerySchema, "query"), ctrl.monthSummary);
  parentRouter.use("/expenses", monthly);
}

module.exports = mountExpensesRoutes;
