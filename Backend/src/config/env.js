const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: path.resolve(__dirname, "../../../.env"),
});

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || "",
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:3000",
  aiServiceUrl: process.env.AI_SERVICE_URL || "http://localhost:8000",
};

// Fail fast on missing critical secrets so the API never boots in an insecure
// state. Called from server startup.
function assertRequiredEnv() {
  const missing = [];
  if (!env.databaseUrl) missing.push("DATABASE_URL");
  if (!env.jwtSecret) missing.push("JWT_SECRET");
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

module.exports = { env, assertRequiredEnv };
