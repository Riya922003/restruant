const { asyncHandler } = require("../../utils/async-handler");
const { ok, created } = require("../../utils/respond");
const svc = require("./users.service");

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
  ok(res, await svc.update(req.params.id, req.body, req.user));
});

const resetPassword = asyncHandler(async (req, res) => {
  ok(res, await svc.resetPassword(req.params.id, req.body.new_password, req.user));
});

const remove = asyncHandler(async (req, res) => {
  ok(res, await svc.remove(req.params.id, req.user));
});

module.exports = { list, getById, create, update, resetPassword, remove };
