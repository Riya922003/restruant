const { app } = require("./app");
const { env, assertRequiredEnv } = require("./config/env");
const { pool } = require("./config/database");

async function startServer() {
  assertRequiredEnv();
  await pool.query("SELECT 1");

  app.listen(env.port, () => {
    console.log(`RestaurantOS API listening on port ${env.port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start API server", error);
  process.exit(1);
});

