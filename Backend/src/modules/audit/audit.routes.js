const { Router } = require("express");
const { authMiddleware } = require("../../middlewares/auth.middleware");
const { requireRole } = require("../../middlewares/rbac.middleware");
const { validate } = require("../../middlewares/validate.middleware");
const { querySchema } = require("./audit.validation");
const ctrl = require("./audit.controller");

// Reading the audit trail is limited to owner (bypass) and manager. Every route
// enforces this server-side; the frontend nav gating is UX only.
function mountAuditRoutes(parentRouter) {
  const router = Router();
  router.use(authMiddleware);

  router.get("/", requireRole("manager"), validate(querySchema, "query"), ctrl.list);
  router.get("/facets", requireRole("manager"), ctrl.facets);

  parentRouter.use("/audit-logs", router);
}

module.exports = mountAuditRoutes;
