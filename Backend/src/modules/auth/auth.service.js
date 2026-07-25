const { pool } = require("../../config/database");
const { ApiError } = require("../../utils/api-error");
const { signAccessToken } = require("../../utils/jwt");
const { hashPassword, verifyPassword } = require("../../utils/password");

// Strip the password hash before any user object leaves the service.
function toPublicUser(row) {
  return {
    id: Number(row.id),
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    phone: row.phone,
    is_active: row.is_active,
  };
}

async function authenticateUser({ email, password }) {
  const { rows } = await pool.query(
    "SELECT * FROM users WHERE email = $1 LIMIT 1",
    [email]
  );
  const user = rows[0];

  // Uniform failure for unknown email, wrong password, or deactivated account
  // so responses cannot be used to enumerate users.
  const invalid = new ApiError(401, "Invalid credentials");
  if (!user || !user.is_active) throw invalid;

  const passwordMatches = await verifyPassword(password, user.password_hash);
  if (!passwordMatches) throw invalid;

  await pool.query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);

  const token = signAccessToken(user);
  return { token, user: toPublicUser(user) };
}

async function getMe(userId) {
  const { rows } = await pool.query(
    "SELECT * FROM users WHERE id = $1 LIMIT 1",
    [userId]
  );
  const user = rows[0];
  if (!user || !user.is_active) {
    throw new ApiError(401, "Invalid or expired token");
  }
  return toPublicUser(user);
}

async function changePassword(userId, { current_password, new_password }) {
  const { rows } = await pool.query(
    "SELECT * FROM users WHERE id = $1 LIMIT 1",
    [userId]
  );
  const user = rows[0];
  if (!user) throw new ApiError(401, "Authentication required");

  const matches = await verifyPassword(current_password, user.password_hash);
  if (!matches) throw new ApiError(400, "Current password is incorrect");

  const newHash = await hashPassword(new_password);
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newHash, userId]);

  return { success: true };
}

module.exports = { authenticateUser, getMe, changePassword, toPublicUser };
