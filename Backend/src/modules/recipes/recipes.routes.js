const { Router } = require("express");
const { authMiddleware } = require("../../middlewares/auth.middleware");
const { requireRole } = require("../../middlewares/rbac.middleware");
const { validate } = require("../../middlewares/validate.middleware");
const v = require("./recipes.validation");
const ctrl = require("./recipes.controller");

const READ_ROLES = ["manager", "chef", "waiter"];
const WRITE_ROLES = ["manager", "chef"];

function mountRecipesRoutes(parentRouter) {
  const router = Router();
  router.use(authMiddleware);

  router.get("/", requireRole(...READ_ROLES), validate(v.querySchema, "query"), ctrl.list);
  router.get("/:id", requireRole(...READ_ROLES), ctrl.getById);
  router.post("/", requireRole(...WRITE_ROLES), validate(v.createSchema), ctrl.create);
  router.patch("/:id", requireRole(...WRITE_ROLES), validate(v.updateSchema), ctrl.update);
  router.put("/:id/ingredients", requireRole(...WRITE_ROLES), validate(v.replaceIngredientsSchema), ctrl.replaceIngredients);
  router.post("/:id/ingredients", requireRole(...WRITE_ROLES), validate(v.ingredientInput), ctrl.addIngredient);
  router.patch("/:id/ingredients/:ingredientId", requireRole(...WRITE_ROLES), validate(v.lineUpdateSchema), ctrl.updateIngredient);
  router.delete("/:id/ingredients/:ingredientId", requireRole(...WRITE_ROLES), ctrl.removeIngredient);
  router.delete("/:id", requireRole(...WRITE_ROLES), ctrl.remove);

  parentRouter.use("/recipes", router);

  // Convenience lookup by menu item id, mounted directly under /api.
  parentRouter.get(
    "/menu-items/:menuItemId/recipe",
    authMiddleware,
    requireRole(...READ_ROLES),
    ctrl.getByMenuItem
  );
}

module.exports = mountRecipesRoutes;
