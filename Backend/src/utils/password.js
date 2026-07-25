const bcrypt = require("bcryptjs");

// Cost factor shared by the seed script and the auth service so a password
// hashed in one place verifies in the other.
const BCRYPT_ROUNDS = 10;

async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, verifyPassword, BCRYPT_ROUNDS };
