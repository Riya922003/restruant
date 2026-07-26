const { asyncHandler } = require("../../utils/async-handler");
const { ok, created } = require("../../utils/respond");
const categories = require("./expenses.categories.service");
const records = require("./expenses.records.service");
const monthlyService = require("./expenses.monthly.service");

// ---- Expense categories ----------------------------------------------------

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

// ---- Expense records -------------------------------------------------------

const listRecords = asyncHandler(async (req, res) => {
  const { rows, meta } = await records.list(req.query);
  ok(res, rows, meta);
});

const getRecord = asyncHandler(async (req, res) => {
  ok(res, await records.getById(req.params.id));
});

const createRecord = asyncHandler(async (req, res) => {
  created(res, await records.create(req.body, req.user));
});

const updateRecord = asyncHandler(async (req, res) => {
  ok(res, await records.update(req.params.id, req.body, req.user));
});

const removeRecord = asyncHandler(async (req, res) => {
  ok(res, await records.remove(req.params.id, req.user));
});

// ---- Monthly tracking ------------------------------------------------------

const monthly = asyncHandler(async (req, res) => {
  const { rows, meta } = await monthlyService.monthly(req.query.year);
  ok(res, rows, meta);
});

const monthSummary = asyncHandler(async (req, res) => {
  const { rows, meta } = await monthlyService.monthSummary(req.query.month);
  ok(res, rows, meta);
});

module.exports = {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  removeCategory,
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  removeRecord,
  monthly,
  monthSummary,
};
