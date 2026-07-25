const { Router } = require("express");

function mountIngredientsRoutes(parentRouter) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ module: "ingredients", status: "pending" });
  });

  parentRouter.use("/ingredients", router);
}

module.exports = mountIngredientsRoutes;

