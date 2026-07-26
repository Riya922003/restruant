const { asyncHandler } = require("../../utils/async-handler");
const { ok, created } = require("../../utils/respond");
const categories = require("./inventory.categories.service");
const products = require("./inventory.products.service");
const warehouses = require("./inventory.warehouses.service");
const movements = require("./inventory.movements.service");

// ---- Product categories -------------------------------------------------

const listCategories = asyncHandler(async (req, res) => {
  const { rows, meta } = await categories.list(req.query);
  ok(res, rows, meta);
});

const getCategory = asyncHandler(async (req, res) => {
  ok(res, await categories.getById(req.params.id));
});

const createCategory = asyncHandler(async (req, res) => {
  created(res, await categories.create(req.body, req.user));
});

const updateCategory = asyncHandler(async (req, res) => {
  ok(res, await categories.update(req.params.id, req.body, req.user));
});

const removeCategory = asyncHandler(async (req, res) => {
  ok(res, await categories.remove(req.params.id, req.user));
});

// ---- Products -----------------------------------------------------------

const listProducts = asyncHandler(async (req, res) => {
  const { rows, meta } = await products.list(req.query);
  ok(res, rows, meta);
});

const getProduct = asyncHandler(async (req, res) => {
  ok(res, await products.getById(req.params.id));
});

const createProduct = asyncHandler(async (req, res) => {
  created(res, await products.create(req.body, req.user));
});

const updateProduct = asyncHandler(async (req, res) => {
  ok(res, await products.update(req.params.id, req.body, req.user));
});

const removeProduct = asyncHandler(async (req, res) => {
  ok(res, await products.remove(req.params.id, req.user));
});

// ---- Warehouses ---------------------------------------------------------

const listWarehouses = asyncHandler(async (req, res) => {
  const { rows, meta } = await warehouses.list(req.query);
  ok(res, rows, meta);
});

const getWarehouse = asyncHandler(async (req, res) => {
  ok(res, await warehouses.getById(req.params.id));
});

const createWarehouse = asyncHandler(async (req, res) => {
  created(res, await warehouses.create(req.body, req.user));
});

const updateWarehouse = asyncHandler(async (req, res) => {
  ok(res, await warehouses.update(req.params.id, req.body, req.user));
});

const removeWarehouse = asyncHandler(async (req, res) => {
  ok(res, await warehouses.remove(req.params.id, req.user));
});

// ---- Stock movements ----------------------------------------------------

const listMovements = asyncHandler(async (req, res) => {
  const { rows, meta } = await movements.list(req.query);
  ok(res, rows, meta);
});

const getMovement = asyncHandler(async (req, res) => {
  ok(res, await movements.getById(req.params.id));
});

const createMovement = asyncHandler(async (req, res) => {
  created(res, await movements.create(req.body, req.user));
});

module.exports = {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  removeCategory,
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  removeProduct,
  listWarehouses,
  getWarehouse,
  createWarehouse,
  updateWarehouse,
  removeWarehouse,
  listMovements,
  getMovement,
  createMovement,
};
