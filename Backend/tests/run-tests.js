const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (!process.env.TEST_DATABASE_URL) {
  console.error("Set TEST_DATABASE_URL to a disposable Postgres database before running backend tests.");
  process.exit(1);
}

const root = path.join(__dirname, "..");
const testFiles = fs
  .readdirSync(__dirname)
  .filter((file) => file.endsWith(".test.js"))
  .sort()
  .map((file) => path.join("tests", file));

const result = spawnSync(
  process.execPath,
  ["--test", "--test-concurrency=1", ...testFiles],
  { cwd: root, stdio: "inherit" }
);

process.exit(result.status ?? 1);
