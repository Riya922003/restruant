const { asyncHandler } = require("../../utils/async-handler");
const { ok, created } = require("../../utils/respond");
const categories = require("./menu.categories.service");
const items = require("./menu.items.service");

const listCategories = asyncHandler(async (req, res) => {
  const { rows, meta } = await categories.list(req.query);
  ok(res, rows, meta);
});

const getCategory = asyncHandler(async (req, res) => {
  ok(res, await categories.getById(req.params.id, { includeItems: req.query.include === "items" }));
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

const listItems = asyncHandler(async (req, res) => {
  const { rows, meta } = await items.list(req.query);
  ok(res, rows, meta);
});

const getItem = asyncHandler(async (req, res) => {
  ok(res, await items.getById(req.params.id));
});

const createItem = asyncHandler(async (req, res) => {
  created(res, await items.create(req.body, req.user));
});

const updateItem = asyncHandler(async (req, res) => {
  ok(res, await items.update(req.params.id, req.body, req.user));
});

const setItemAvailability = asyncHandler(async (req, res) => {
  ok(res, await items.setAvailability(req.params.id, req.body.is_available));
});

const removeItem = asyncHandler(async (req, res) => {
  ok(res, await items.remove(req.params.id, req.user));
});

module.exports = {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  removeCategory,
  listItems,
  getItem,
  createItem,
  updateItem,
  setItemAvailability,
  removeItem,
};
