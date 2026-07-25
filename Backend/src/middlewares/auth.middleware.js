const { ApiError } = require("../utils/api-error");
const { verifyToken } = require("../utils/jwt");

// Require a valid Bearer token. Attaches req.user = { id, role, email } from the
// token claims. Does not hit the database; freshness checks (deactivated user)
// happen in endpoints that re-fetch the user, such as /auth/me.
function authMiddleware(req, _res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return next(new ApiError(401, "Authentication required"));
  }

  try {
    const payload = verifyToken(token);
    req.user = { id: Number(payload.sub), role: payload.role, email: payload.email };
    return next();
  } catch (_error) {
    return next(new ApiError(401, "Invalid or expired token"));
  }
}

module.exports = { authMiddleware };
