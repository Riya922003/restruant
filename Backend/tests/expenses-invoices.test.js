const test = require("node:test");
const assert = require("node:assert/strict");
const { app, request, resetDatabase, closeDatabase, login, auth, first } = require("./helpers/test-server");

test.before(async () => {
  await resetDatabase();
});

test.after(async () => {
  await closeDatabase();
});

test("expense records can be created by management and read by cashier", async () => {
  const manager = await login("manager");
  const cashier = await login("cashier");
  const category = await first("/api/expense-categories?limit=1", manager.token);

  const created = await request(app)
    .post("/api/expense-records")
    .set(auth(manager.token))
    .send({
      category_id: category.id,
      description: "Test kitchen repair",
      amount: 1234.5,
      expense_date: "2026-07-27",
      payment_method: "cash",
      reference: "TEST-EXP",
    })
    .expect(201);

  assert.equal(created.body.data.amount, 1234.5);

  const listed = await request(app)
    .get("/api/expense-records?search=Test%20kitchen")
    .set(auth(cashier.token))
    .expect(200);
  assert.ok(listed.body.data.some((row) => row.id === created.body.data.id));
});

test("supplier invoice can be verified and booked as an expense only once", async () => {
  const manager = await login("manager");
  const supplier = await first("/api/suppliers?limit=1", manager.token);
  const product = await first("/api/products?limit=1", manager.token);
  const category = await first("/api/expense-categories?limit=1", manager.token);

  const invoiceNo = `TEST-INV-${Date.now()}`;
  const invoice = await request(app)
    .post("/api/supplier-invoices")
    .set(auth(manager.token))
    .send({
      invoice_number: invoiceNo,
      supplier_id: supplier.id,
      invoice_date: "2026-07-27",
      tax: 18,
      items: [{ product_id: product.id, description: "Test supplies", quantity: 2, unit_price: 100 }],
    })
    .expect(201);

  assert.equal(invoice.body.data.subtotal, 200);
  assert.equal(invoice.body.data.total, 218);

  await request(app)
    .post(`/api/supplier-invoices/${invoice.body.data.id}/status`)
    .set(auth(manager.token))
    .send({ status: "verified" })
    .expect(200);

  const expense = await request(app)
    .post(`/api/supplier-invoices/${invoice.body.data.id}/expense`)
    .set(auth(manager.token))
    .send({ category_id: category.id, payment_method: "bank_transfer", reference: "TEST-INV-EXP" })
    .expect(200);
  assert.equal(expense.body.data.amount, 218);

  await request(app)
    .post(`/api/supplier-invoices/${invoice.body.data.id}/expense`)
    .set(auth(manager.token))
    .send({ category_id: category.id })
    .expect(409);
});
