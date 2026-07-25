const { Router } = require("express");

function mountPurchasesRoutes(parentRouter) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ module: "purchases", status: "pending" });
  });

  parentRouter.use("/purchases", router);
}

module.exports = mountPurchasesRoutes;

