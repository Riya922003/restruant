const fs = require("fs");
const path = require("path");
const { pool } = require("../config/database");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedVersions(client) {
  const { rows } = await client.query("SELECT version FROM schema_migrations");
  return new Set(rows.map((row) => row.version));
}

function readMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

// Each migration runs in its own transaction so a failure leaves the schema
// untouched at that step and the version is only recorded on success.
async function applyMigration(client, file) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function migrate() {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedVersions(client);
    const files = readMigrationFiles();

    const pending = files.filter((file) => !applied.has(file));
    if (pending.length === 0) {
      console.log("No pending migrations. Schema is up to date.");
      return;
    }

    for (const file of pending) {
      process.stdout.write(`Applying ${file} ... `);
      await applyMigration(client, file);
      console.log("done");
    }

    console.log(`Applied ${pending.length} migration(s).`);
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrate()
    .then(() => pool.end())
    .catch((error) => {
      console.error("Migration failed:", error.message);
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = { migrate };
