const { Pool } = require("pg");
const { env } = require("./env");

// Local Postgres (Docker) speaks plaintext; hosted providers like Neon require
// TLS. Disable SSL for a local/compose host or when the URL explicitly opts out
// with sslmode=disable; otherwise enable it so the same code works in
// development and production. "postgres" is the docker-compose DB service name.
const sslDisabled =
  /sslmode=disable/.test(env.databaseUrl) ||
  /@(localhost|127\.0\.0\.1|host\.docker\.internal|postgres)[:/]/.test(env.databaseUrl);

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: sslDisabled ? false : { rejectUnauthorized: false },
});

module.exports = { pool };

