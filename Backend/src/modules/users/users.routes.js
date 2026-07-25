const { Router } = require("express");
const { authMiddleware } = require("../../middlewares/auth.middleware");
const { requireRole } = require("../../middlewares/rbac.middleware");
const { validate } = require("../../middlewares/validate.middleware");
const ctrl = require("./users.controller");
const {
  createSchema,
  updateSchema,
  querySchema,
  resetPasswordSchema,
} = require("./users.validation");

function mountUsersRoutes(parentRouter) {
  const router = Router();
  router.use(authMiddleware);

  // owner is admitted everywhere via the requireRole owner-bypass; ownership and
  // self rules beyond role are enforced in the service (spec 09 §6, §7).
  router.get("/", requireRole("manager"), validate(querySchema, "query"), ctrl.list);
  router.get("/:id", requireRole("manager"), ctrl.getById);
  router.post("/", requireRole("manager"), validate(createSchema), ctrl.create);
  router.patch("/:id", requireRole("manager"), validate(updateSchema), ctrl.update);
  router.post(
    "/:id/reset-password",
    requireRole("manager"),
    validate(resetPasswordSchema),
    ctrl.resetPassword
  );
  router.delete("/:id", requireRole("manager"), ctrl.remove);

  parentRouter.use("/users", router);
}

module.exports = mountUsersRoutes;
