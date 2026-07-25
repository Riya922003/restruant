const { insert, round2, round3, randInt, pick, chance, daysAgo, monthsAgoStart, toDateOnly } = require("./helpers");

// Supplier invoices with line items and expense records. Invoice totals derive
// from their line items. Recurring monthly costs (rent, salaries, utilities)
// plus scattered spend give the monthly expense views a realistic shape across
// the last six months. Verified and paid invoices are linked to an expense
// record. Phase 1 has no OCR, so file_url and ocr_raw stay null.

const INVOICE_STATUSES = ["pending", "verified", "paid", "paid", "verified", "disputed"];
const EXPENSE_PAYMENTS = ["cash", "card", "upi", "bank_transfer"];

async function seedSupplierInvoices(client, ctx) {
  ctx.invoiceCount = 0;
  ctx.invoiceItemCount = 0;
  let seq = 1;

  for (let i = 0; i < 9; i += 1) {
    const supplierId = pick(ctx.rng, ctx.suppliers);
    const status = INVOICE_STATUSES[i % INVOICE_STATUSES.length];
    const invoiceDate = daysAgo(ctx.asOf, randInt(ctx.rng, 5, 170));
    const dueDate = daysAgo(ctx.asOf, randInt(ctx.rng, 5, 170) - 30);
    const year = invoiceDate.getFullYear();

    const lineCount = randInt(ctx.rng, 2, 4);
    const lines = [];
    for (let j = 0; j < lineCount; j += 1) {
      const product = pick(ctx.rng, ctx.products);
      const quantity = round3(randInt(ctx.rng, 2, 20));
      const unitPrice = round2(product.cost_price * (0.95 + ctx.rng() * 0.2));
      lines.push({
        product_id: product.id,
        description: product.id ? `Supply item ${product.sku || ""}`.trim() : "Supply item",
        quantity,
        unit_price: unitPrice,
        line_total: round2(quantity * unitPrice),
      });
    }

    const subtotal = round2(lines.reduce((sum, l) => sum + l.line_total, 0));
    const tax = round2((subtotal * ctx.taxRate) / 100);
    const total = round2(subtotal + tax);

    const { id: invoiceId } = await insert(client, "supplier_invoices", {
      invoice_number: `INV-${year}-${String(seq).padStart(5, "0")}`,
      supplier_id: supplierId,
      invoice_date: toDateOnly(invoiceDate),
      due_date: toDateOnly(dueDate),
      subtotal,
      tax,
      total,
      status,
      file_url: null,
      ocr_raw: null,
      notes: null,
      created_by: ctx.users.storeManager,
      created_at: invoiceDate,
    });
    seq += 1;
    ctx.invoiceCount += 1;

    for (const line of lines) {
      await insert(client, "supplier_invoice_items", {
        invoice_id: invoiceId,
        product_id: line.product_id,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        line_total: line.line_total,
      });
      ctx.invoiceItemCount += 1;
    }

    // Verified and paid invoices post to the expense register.
    if (status === "verified" || status === "paid") {
      await insert(client, "expense_records", {
        category_id: ctx.expenseCategories.Supplies,
        supplier_id: supplierId,
        invoice_id: invoiceId,
        description: `Supplier invoice INV-${year}-${String(seq - 1).padStart(5, "0")}`,
        amount: total,
        expense_date: toDateOnly(invoiceDate),
        payment_method: status === "paid" ? "bank_transfer" : null,
        reference: `INV-${year}-${String(seq - 1).padStart(5, "0")}`,
        created_by: ctx.users.storeManager,
        created_at: invoiceDate,
      });
      ctx.expenseCount += 1;
    }
  }
}

async function seedRecurringExpenses(client, ctx) {
  const actors = [ctx.users.owner, ctx.users.manager, ctx.users.storeManager];

  for (let m = 0; m < 6; m += 1) {
    const monthStart = monthsAgoStart(ctx.asOf, m);
    const on = (day) => toDateOnly(new Date(monthStart.getFullYear(), monthStart.getMonth(), day, 12));

    const recurring = [
      { cat: "Rent", desc: "Monthly premises rent", amount: 85000, day: 1, method: "bank_transfer" },
      { cat: "Salaries", desc: "Staff salaries", amount: round2(215000 + ctx.rng() * 20000), day: 5, method: "bank_transfer" },
      { cat: "Utilities", desc: "Electricity, water and gas", amount: round2(15000 + ctx.rng() * 8000), day: 8, method: "card" },
    ];

    for (const r of recurring) {
      await insert(client, "expense_records", {
        category_id: ctx.expenseCategories[r.cat],
        supplier_id: null,
        invoice_id: null,
        description: r.desc,
        amount: r.amount,
        expense_date: on(r.day),
        payment_method: r.method,
        reference: null,
        created_by: pick(ctx.rng, actors),
      });
      ctx.expenseCount += 1;
    }
  }
}

async function seedScatteredExpenses(client, ctx) {
  const actors = [ctx.users.owner, ctx.users.manager, ctx.users.storeManager];
  const buckets = [
    { cat: "Supplies", min: 1500, max: 9000 },
    { cat: "Maintenance", min: 2000, max: 15000 },
    { cat: "Marketing", min: 3000, max: 25000 },
  ];

  for (let i = 0; i < 24; i += 1) {
    const bucket = pick(ctx.rng, buckets);
    const withSupplier = chance(ctx.rng, 0.4);
    await insert(client, "expense_records", {
      category_id: ctx.expenseCategories[bucket.cat],
      supplier_id: withSupplier ? pick(ctx.rng, ctx.suppliers) : null,
      invoice_id: null,
      description: `${bucket.cat} expense`,
      amount: round2(bucket.min + ctx.rng() * (bucket.max - bucket.min)),
      expense_date: toDateOnly(daysAgo(ctx.asOf, randInt(ctx.rng, 1, 178))),
      payment_method: pick(ctx.rng, EXPENSE_PAYMENTS),
      reference: null,
      created_by: pick(ctx.rng, actors),
    });
    ctx.expenseCount += 1;
  }
}

async function seedExpenses(client, ctx) {
  ctx.expenseCount = 0;
  await seedSupplierInvoices(client, ctx);
  await seedRecurringExpenses(client, ctx);
  await seedScatteredExpenses(client, ctx);
}

module.exports = { seedExpenses };
