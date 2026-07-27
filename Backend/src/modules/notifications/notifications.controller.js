const { asyncHandler } = require("../../utils/async-handler");
const { ok } = require("../../utils/respond");
const svc = require("./notifications.service");

const feed = asyncHandler(async (req, res) => {
  ok(res, await svc.getFeed(req.user));
});

const seen = asyncHandler(async (req, res) => {
  ok(res, await svc.markSeen(req.user));
});

module.exports = { feed, seen };
