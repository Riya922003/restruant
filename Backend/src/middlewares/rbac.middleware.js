const { ApiError } = require("../utils/api-error");

// Authorize by role. Owner is allowed everywhere via a bypass, so routes only
// list the additional roles they permit. Default deny: a role not listed gets a
// 403. Must run after authMiddleware so req.user is set.
function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new ApiError(401, "Authentication required"));
    }
    if (req.user.role === "owner" || allowedRoles.includes(req.user.role)) {
      return next();
    }
    return next(new ApiError(403, "You do not have permission to perform this action"));
  };
}

module.exports = { requireRole };
