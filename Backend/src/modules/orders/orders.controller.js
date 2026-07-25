const { asyncHandler } = require("../../utils/async-handler");
const { ok, created } = require("../../utils/respond");
const svc = require("./orders.service");

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

const updateHeader = asyncHandler(async (req, res) => {
  ok(res, await svc.updateHeader(req.params.id, req.body));
});

const transitionStatus = asyncHandler(async (req, res) => {
  ok(res, await svc.transitionStatus(req.params.id, req.body.status, req.user));
});

const payment = asyncHandler(async (req, res) => {
  ok(res, await svc.takePayment(req.params.id, req.body, req.user));
});

const cancel = asyncHandler(async (req, res) => {
  ok(res, await svc.cancel(req.params.id, req.user));
});

const listItems = asyncHandler(async (req, res) => {
  ok(res, await svc.listItems(req.params.id));
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

module.exports = {
  list,
  getById,
  create,
  updateHeader,
  transitionStatus,
  payment,
  cancel,
  listItems,
  addItem,
  updateItem,
  removeItem,
};
