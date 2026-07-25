const { Router } = require("express");

function mountUsersRoutes(parentRouter) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ module: "users", status: "pending" });
  });

  parentRouter.use("/users", router);
}

module.exports = mountUsersRoutes;

