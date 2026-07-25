const { Router } = require("express");
const { authMiddleware } = require("../../middlewares/auth.middleware");
const { requireRole } = require("../../middlewares/rbac.middleware");
const { validate } = require("../../middlewares/validate.middleware");
const v = require("./inventory.validation");
const ctrl = require("./inventory.controller");

const WRITE_ROLES = ["manager", "store_manager"];

function mountInventoryRoutes(parentRouter) {
  // Product categories
  const categories = Router();
  categories.use(authMiddleware);
  categories.get("/", requireRole(...WRITE_ROLES), validate(v.categoryQuerySchema, "query"), ctrl.listCategories);
  categories.get("/:id", requireRole(...WRITE_ROLES), ctrl.getCategory);
  categories.post("/", requireRole(...WRITE_ROLES), validate(v.categoryCreateSchema), ctrl.createCategory);
  categories.patch("/:id", requireRole(...WRITE_ROLES), validate(v.categoryUpdateSchema), ctrl.updateCategory);
  categories.delete("/:id", requireRole(...WRITE_ROLES), ctrl.removeCategory);
  parentRouter.use("/product-categories", categories);

  // Products
  const products = Router();
  products.use(authMiddleware);
  products.get("/", requireRole(...WRITE_ROLES), validate(v.productQuerySchema, "query"), ctrl.listProducts);
  products.get("/:id", requireRole(...WRITE_ROLES), ctrl.getProduct);
  products.post("/", requireRole(...WRITE_ROLES), validate(v.productCreateSchema), ctrl.createProduct);
  products.patch("/:id", requireRole(...WRITE_ROLES), validate(v.productUpdateSchema), ctrl.updateProduct);
  products.delete("/:id", requireRole(...WRITE_ROLES), ctrl.removeProduct);
  parentRouter.use("/products", products);

  // Warehouses
  const warehouses = Router();
  warehouses.use(authMiddleware);
  warehouses.get("/", requireRole(...WRITE_ROLES), validate(v.warehouseQuerySchema, "query"), ctrl.listWarehouses);
  warehouses.get("/:id", requireRole(...WRITE_ROLES), ctrl.getWarehouse);
  warehouses.post("/", requireRole(...WRITE_ROLES), validate(v.warehouseCreateSchema), ctrl.createWarehouse);
  warehouses.patch("/:id", requireRole(...WRITE_ROLES), validate(v.warehouseUpdateSchema), ctrl.updateWarehouse);
  warehouses.delete("/:id", requireRole(...WRITE_ROLES), ctrl.removeWarehouse);
  parentRouter.use("/warehouses", warehouses);

  // Stock movements (immutable ledger: no patch/delete)
  const movements = Router();
  movements.use(authMiddleware);
  movements.get("/", requireRole(...WRITE_ROLES), validate(v.movementQuerySchema, "query"), ctrl.listMovements);
  movements.get("/:id", requireRole(...WRITE_ROLES), ctrl.getMovement);
  movements.post("/", requireRole(...WRITE_ROLES), validate(v.movementCreateSchema), ctrl.createMovement);
  parentRouter.use("/stock-movements", movements);
}

module.exports = mountInventoryRoutes;
