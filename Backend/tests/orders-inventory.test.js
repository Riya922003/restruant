const test = require("node:test");
const assert = require("node:assert/strict");
const { app, pool, request, resetDatabase, closeDatabase, login, auth, first } = require("./helpers/test-server");

test.before(async () => {
  await resetDatabase();
});

test.after(async () => {
  await closeDatabase();
});

test("waiter can create and send an order; bad transition is rejected", async () => {
  const waiter = await login("waiter");
  const item = await first("/api/menu-items?limit=1&is_available=true", waiter.token);

  const created = await request(app)
    .post("/api/orders")
    .set(auth(waiter.token))
    .send({
      order_type: "takeaway",
      items: [{ menu_item_id: item.id, quantity: 2 }],
    })
    .expect(201);

  const order = created.body.data;
  assert.equal(order.status, "open");
  assert.equal(order.subtotal, item.price * 2);
  assert.ok(order.total >= order.subtotal);

  const audit = await pool.query(
    "SELECT 1 FROM audit_logs WHERE action = 'order.created' AND entity_id = $1",
    [order.id]
  );
  assert.equal(audit.rowCount, 1);

  await request(app)
    .patch(`/api/orders/${order.id}/status`)
    .set(auth(waiter.token))
    .send({ status: "ready" })
    .expect(409);

  const transitioned = await request(app)
    .patch(`/api/orders/${order.id}/status`)
    .set(auth(waiter.token))
    .send({ status: "sent_to_kitchen" })
    .expect(200);
  assert.equal(transitioned.body.data.status, "sent_to_kitchen");
});

test("stock movements update stock atomically and reject insufficient stock", async () => {
  const store = await login("store_manager");
  const product = await first("/api/products?limit=1&sort=name", store.token);
  const before = Number(product.current_stock);

  const stockIn = await request(app)
    .post("/api/stock-movements")
    .set(auth(store.token))
    .send({
      product_id: product.id,
      warehouse_id: product.warehouse_id,
      movement_type: "stock_in",
      quantity: 5,
      unit_cost: product.cost_price || 1,
      reference: "TEST-IN",
    })
    .expect(201);
  assert.equal(stockIn.body.data.product_current_stock, before + 5);

  const failed = await request(app)
    .post("/api/stock-movements")
    .set(auth(store.token))
    .send({
      product_id: product.id,
      warehouse_id: product.warehouse_id,
      movement_type: "stock_out",
      quantity: before + 100000,
      reference: "TEST-FAIL",
    })
    .expect(422);
  assert.match(failed.body.message, /Insufficient stock/);

  const after = await request(app).get(`/api/products/${product.id}`).set(auth(store.token)).expect(200);
  assert.equal(after.body.data.current_stock, before + 5);
});
