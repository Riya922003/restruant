const { asyncHandler } = require("../../utils/async-handler");
const { ok } = require("../../utils/respond");
const svc = require("./audit.service");

const list = asyncHandler(async (req, res) => {
  const { rows, meta } = await svc.list(req.query);
  ok(res, rows, meta);
});

const facets = asyncHandler(async (_req, res) => {
  ok(res, await svc.facets());
});

module.exports = { list, facets };
