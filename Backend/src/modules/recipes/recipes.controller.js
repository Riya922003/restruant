const { asyncHandler } = require("../../utils/async-handler");
const { ok, created } = require("../../utils/respond");
const svc = require("./recipes.service");

const list = asyncHandler(async (req, res) => {
  const { rows, meta } = await svc.list(req.query);
  ok(res, rows, meta);
});

const getById = asyncHandler(async (req, res) => {
  ok(res, await svc.getById(req.params.id));
});

const getByMenuItem = asyncHandler(async (req, res) => {
  ok(res, await svc.getByMenuItem(req.params.menuItemId));
});

const create = asyncHandler(async (req, res) => {
  created(res, await svc.create(req.body, req.user));
});

const update = asyncHandler(async (req, res) => {
  ok(res, await svc.update(req.params.id, req.body, req.user));
});

const replaceIngredients = asyncHandler(async (req, res) => {
  ok(res, await svc.replaceIngredients(req.params.id, req.body.ingredients));
});

const addIngredient = asyncHandler(async (req, res) => {
  created(res, await svc.addIngredient(req.params.id, req.body));
});

const updateIngredient = asyncHandler(async (req, res) => {
  ok(res, await svc.updateIngredient(req.params.id, req.params.ingredientId, req.body));
});

const removeIngredient = asyncHandler(async (req, res) => {
  ok(res, await svc.removeIngredient(req.params.id, req.params.ingredientId));
});

const remove = asyncHandler(async (req, res) => {
  ok(res, await svc.remove(req.params.id, req.user));
});

module.exports = {
  list,
  getById,
  getByMenuItem,
  create,
  update,
  replaceIngredients,
  addIngredient,
  updateIngredient,
  removeIngredient,
  remove,
};
