const { spawnSync } = require("node:child_process");

if (!process.env.TEST_DATABASE_URL) {
  console.error("Set TEST_DATABASE_URL to a disposable Postgres database before running backend tests.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--test", "--test-concurrency=1", "tests/*.test.js"],
  { cwd: __dirname + "/..", stdio: "inherit", shell: process.platform === "win32" }
);

process.exit(result.status ?? 1);
