const { asyncHandler } = require("../../utils/async-handler");
const { ok, created } = require("../../utils/respond");
const svc = require("./purchases.service");

const list = asyncHandler(async (req, res) => {
  const { rows, meta } = await svc.list(req.query);
  ok(res, rows, meta);
});

const getById = asyncHandler(async (req, res) => {
  ok(res, await svc.getById(req.params.id));
});

const create = asyncHandler(async (req, res) => {
  created(res, await svc.create(req.body, req.user));
});

const update = asyncHandler(async (req, res) => {
  ok(res, await svc.updateHeader(req.params.id, req.body));
});

const addItem = asyncHandler(async (req, res) => {
  created(res, await svc.addItem(req.params.id, req.body));
});

const updateItem = asyncHandler(async (req, res) => {
  ok(res, await svc.updateItem(req.params.id, req.params.itemId, req.body));
});

const removeItem = asyncHandler(async (req, res) => {
  ok(res, await svc.removeItem(req.params.id, req.params.itemId));
});

const receive = asyncHandler(async (req, res) => {
  ok(res, await svc.receive(req.params.id, req.body, req.user));
});

const remove = asyncHandler(async (req, res) => {
  ok(res, await svc.remove(req.params.id));
});

module.exports = { list, getById, create, update, addItem, updateItem, removeItem, receive, remove };
