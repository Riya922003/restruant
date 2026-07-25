const jwt = require("jsonwebtoken");
const { env } = require("../config/env");

// Sign a short-lived access token. Payload is kept minimal: subject (user id),
// role for RBAC without a DB round-trip, and email for display.
function signAccessToken(user) {
  const payload = {
    sub: String(user.id),
    role: user.role,
    email: user.email,
  };
  return jwt.sign(payload, env.jwtSecret, {
    algorithm: "HS256",
    expiresIn: env.jwtExpiresIn,
  });
}

function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
}

module.exports = { signAccessToken, verifyToken };
