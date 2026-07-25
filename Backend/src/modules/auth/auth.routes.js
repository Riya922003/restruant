const { Router } = require("express");
const { authMiddleware } = require("../../middlewares/auth.middleware");
const { validate } = require("../../middlewares/validate.middleware");
const { loginSchema, changePasswordSchema } = require("./auth.validation");
const ctrl = require("./auth.controller");

function mountAuthRoutes(parentRouter) {
  const router = Router();

  // Public: the only route reachable without a token.
  router.post("/login", validate(loginSchema), ctrl.login);

  // Protected.
  router.get("/me", authMiddleware, ctrl.me);
  router.post("/logout", authMiddleware, ctrl.logout);
  router.post(
    "/change-password",
    authMiddleware,
    validate(changePasswordSchema),
    ctrl.changePassword
  );

  parentRouter.use("/auth", router);
}

module.exports = mountAuthRoutes;
