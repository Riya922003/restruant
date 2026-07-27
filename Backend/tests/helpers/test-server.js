process.env.NODE_ENV = "test";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("Set TEST_DATABASE_URL to a disposable Postgres database before running backend tests.");
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
process.env.FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";

const request = require("supertest");
const { app } = require("../../src/app");
const { pool } = require("../../src/config/database");
const { migrate } = require("../../src/db/migrate");
const { seed } = require("../../src/db/seed");

const USERS = {
  owner: ["owner@restaurantos.test", "Owner@123"],
  manager: ["manager@restaurantos.test", "Manager@123"],
  chef: ["chef@restaurantos.test", "Chef@123"],
  waiter: ["waiter@restaurantos.test", "Waiter@123"],
  cashier: ["cashier@restaurantos.test", "Cashier@123"],
  store_manager: ["store@restaurantos.test", "Store@123"],
};

async function resetDatabase() {
  await migrate();
  await seed();
}

async function closeDatabase() {
  await pool.end();
}

async function login(role) {
  const creds = USERS[role];
  if (!creds) throw new Error(`Unknown test role: ${role}`);
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: creds[0], password: creds[1] })
    .expect(200);
  return { token: res.body.data.token, user: res.body.data.user };
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function first(path, token) {
  const res = await request(app).get(path).set(auth(token)).expect(200);
  const row = res.body.data?.[0];
  if (!row) throw new Error(`No seeded row returned from ${path}`);
  return row;
}

module.exports = { app, pool, request, resetDatabase, closeDatabase, login, auth, first };
