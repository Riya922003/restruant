const { Router } = require("express");
const { authMiddleware } = require("../../middlewares/auth.middleware");
const ctrl = require("./notifications.controller");

// Any authenticated user gets their own role-scoped feed; the service decides
// which events are relevant to the caller's role.
function mountNotificationsRoutes(parentRouter) {
  const router = Router();
  router.use(authMiddleware);

  router.get("/", ctrl.feed);
  router.post("/seen", ctrl.seen);

  parentRouter.use("/notifications", router);
}

module.exports = mountNotificationsRoutes;
