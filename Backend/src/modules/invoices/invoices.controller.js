const { asyncHandler } = require("../../utils/async-handler");
const { ok, created } = require("../../utils/respond");
const { ApiError } = require("../../utils/api-error");
const svc = require("./invoices.service");

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

const remove = asyncHandler(async (req, res) => {
  ok(res, await svc.remove(req.params.id, req.user));
});

const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(422, "No file uploaded");
  ok(res, await svc.setFile(req.params.id, `/uploads/${req.file.filename}`));
});

const setStatus = asyncHandler(async (req, res) => {
  ok(res, await svc.setStatus(req.params.id, req.body.status));
});

const generateExpense = asyncHandler(async (req, res) => {
  created(res, await svc.generateExpense(req.params.id, req.body, req.user));
});

module.exports = { list, getById, create, update, remove, uploadFile, setStatus, generateExpense };
