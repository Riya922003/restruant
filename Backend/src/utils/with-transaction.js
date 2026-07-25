const { pool } = require("../config/database");

// Run fn inside a single database transaction. Commits on success, rolls back
// on any thrown error, and always releases the client.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { withTransaction };
