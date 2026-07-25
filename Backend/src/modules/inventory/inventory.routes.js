const { Router } = require("express");

function mountInventoryRoutes(parentRouter) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ module: "inventory", status: "pending" });
  });

  parentRouter.use("/inventory", router);
}

module.exports = mountInventoryRoutes;

