const { Router } = require("express");
const { authMiddleware } = require("../../middlewares/auth.middleware");
const { requireRole } = require("../../middlewares/rbac.middleware");
const { validate } = require("../../middlewares/validate.middleware");
const v = require("./menu.validation");
const ctrl = require("./menu.controller");

const READ_ROLES = ["manager", "chef", "waiter", "cashier"];

function mountMenuRoutes(parentRouter) {
  const categories = Router();
  categories.use(authMiddleware);
  categories.get("/", requireRole(...READ_ROLES), validate(v.categoryQuerySchema, "query"), ctrl.listCategories);
  categories.get("/:id", requireRole(...READ_ROLES), ctrl.getCategory);
  categories.post("/", requireRole("manager"), validate(v.categoryCreateSchema), ctrl.createCategory);
  categories.patch("/:id", requireRole("manager"), validate(v.categoryUpdateSchema), ctrl.updateCategory);
  categories.delete("/:id", requireRole("manager"), ctrl.removeCategory);
  parentRouter.use("/menu-categories", categories);

  const items = Router();
  items.use(authMiddleware);
  items.get("/", requireRole(...READ_ROLES), validate(v.itemQuerySchema, "query"), ctrl.listItems);
  items.get("/:id", requireRole(...READ_ROLES), ctrl.getItem);
  items.post("/", requireRole("manager"), validate(v.itemCreateSchema), ctrl.createItem);
  items.patch("/:id", requireRole("manager", "chef"), validate(v.itemUpdateSchema), ctrl.updateItem);
  items.patch("/:id/availability", requireRole("manager", "chef"), validate(v.availabilitySchema), ctrl.setItemAvailability);
  items.delete("/:id", requireRole("manager"), ctrl.removeItem);
  parentRouter.use("/menu-items", items);
}

module.exports = mountMenuRoutes;
