const { Router } = require("express");

function mountSuppliersRoutes(parentRouter) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ module: "suppliers", status: "pending" });
  });

  parentRouter.use("/suppliers", router);
}

module.exports = mountSuppliersRoutes;

