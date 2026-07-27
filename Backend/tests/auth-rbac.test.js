const test = require("node:test");
const assert = require("node:assert/strict");
const { verifyToken } = require("../src/utils/jwt");
const { app, request, resetDatabase, closeDatabase, login, auth } = require("./helpers/test-server");

test.before(async () => {
  await resetDatabase();
});

test.after(async () => {
  await closeDatabase();
});

test("valid login returns a JWT with expected claims", async () => {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "waiter@restaurantos.test", password: "Waiter@123" })
    .expect(200);

  assert.equal(res.body.data.user.role, "waiter");
  const payload = verifyToken(res.body.data.token);
  assert.equal(payload.role, "waiter");
  assert.equal(payload.email, "waiter@restaurantos.test");
  assert.ok(payload.sub);
});

test("bad password is rejected", async () => {
  await request(app)
    .post("/api/auth/login")
    .send({ email: "waiter@restaurantos.test", password: "wrong" })
    .expect(401);
});

test("protected routes enforce missing-token, wrong-role, and allowed-role cases", async () => {
  await request(app).get("/api/users").expect(401);

  const waiter = await login("waiter");
  await request(app).get("/api/users").set(auth(waiter.token)).expect(403);

  const manager = await login("manager");
  const res = await request(app).get("/api/users").set(auth(manager.token)).expect(200);
  assert.ok(Array.isArray(res.body.data));
});

