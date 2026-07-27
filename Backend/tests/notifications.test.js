const test = require("node:test");
const assert = require("node:assert/strict");
const { app, request, resetDatabase, closeDatabase, login, auth, first } = require("./helpers/test-server");

test.before(async () => {
  await resetDatabase();
});

test.after(async () => {
  await closeDatabase();
});

test("notification feed is role-scoped and excludes the current actor", async () => {
  const waiter = await login("waiter");
  const chef = await login("chef");
  const item = await first("/api/menu-items?limit=1&is_available=true", waiter.token);

  const created = await request(app)
    .post("/api/orders")
    .set(auth(waiter.token))
    .send({ order_type: "takeaway", items: [{ menu_item_id: item.id, quantity: 1 }] })
    .expect(201);

  const waiterFeed = await request(app).get("/api/notifications").set(auth(waiter.token)).expect(200);
  assert.equal(
    waiterFeed.body.data.items.some((row) => row.action === "order.created" && row.entity_id === created.body.data.id),
    false
  );

  const chefFeed = await request(app).get("/api/notifications").set(auth(chef.token)).expect(200);
  assert.equal(
    chefFeed.body.data.items.some((row) => row.action === "order.created" && row.entity_id === created.body.data.id),
    true
  );
});
