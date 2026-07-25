const { asyncHandler } = require("../../utils/async-handler");
const { ok } = require("../../utils/respond");
const svc = require("./auth.service");

const login = asyncHandler(async (req, res) => {
  const result = await svc.authenticateUser(req.body);
  ok(res, result);
});

const me = asyncHandler(async (req, res) => {
  const user = await svc.getMe(req.user.id);
  ok(res, user);
});

const logout = asyncHandler(async (_req, res) => {
  // Stateless JWT: nothing to invalidate server-side. The client discards the
  // token. Endpoint exists for a clean frontend contract.
  ok(res, { success: true });
});

const changePassword = asyncHandler(async (req, res) => {
  const result = await svc.changePassword(req.user.id, req.body);
  ok(res, result);
});

module.exports = { login, me, logout, changePassword };
