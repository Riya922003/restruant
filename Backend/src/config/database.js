const { Pool } = require("pg");
const { env } = require("./env");

// Local Postgres (Docker) speaks plaintext; hosted providers like Neon require
// TLS. Enable SSL for any non-local connection string so the same code works in
// development and production.
const isLocal = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(env.databaseUrl);

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

module.exports = { pool };

