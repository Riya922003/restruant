const { Router } = require("express");

const modules = [
  require("./modules/auth/auth.routes"),
  require("./modules/users/users.routes"),
  require("./modules/tables/tables.routes"),
  require("./modules/orders/orders.routes"),
  require("./modules/menu/menu.routes"),
  require("./modules/recipes/recipes.routes"),
  require("./modules/ingredients/ingredients.routes"),
  require("./modules/suppliers/suppliers.routes"),
  require("./modules/inventory/inventory.routes"),
  require("./modules/purchases/purchases.routes"),
  require("./modules/expenses/expenses.routes"),
  require("./modules/invoices/invoices.routes"),
  require("./modules/dashboard/dashboard.routes"),
];

function registerRoutes() {
  const router = Router();

  for (const mountModule of modules) {
    mountModule(router);
  }

  return router;
}

module.exports = { registerRoutes };

