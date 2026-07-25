const { Router } = require("express");

function mountExpensesRoutes(parentRouter) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ module: "expenses", status: "pending" });
  });

  parentRouter.use("/expenses", router);
}

module.exports = mountExpensesRoutes;

