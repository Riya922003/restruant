const { Router } = require("express");

function mountDashboardRoutes(parentRouter) {
  const router = Router();

  router.get("/summary", (_req, res) => {
    res.json({ module: "dashboard", status: "pending" });
  });

  parentRouter.use("/dashboard", router);
}

module.exports = mountDashboardRoutes;

