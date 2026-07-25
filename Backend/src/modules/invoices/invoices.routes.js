const { Router } = require("express");

function mountInvoicesRoutes(parentRouter) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ module: "invoices", status: "pending" });
  });

  parentRouter.use("/invoices", router);
}

module.exports = mountInvoicesRoutes;

