const { insert, round2, round3, randInt, pick, chance, daysAgo, toDateOnly } = require("./helpers");

// Purchase orders plus the stock movement ledger. Every product gets an opening
// stock_in; received purchase orders add more stock_in referencing their PO
// number; a few wastage/stock_out movements add realism. Product current_stock
// is then recomputed from the ledger so balances and movements always agree.

const PO_STATUSES = ["draft", "ordered", "partially_received", "received", "received", "cancelled"];

function movementDelta(type) {
  return type === "stock_in" || type === "transfer" ? 1 : -1;
}

async function insertMovement(client, ctx, row) {
  await insert(client, "stock_movements", row, "id");
  ctx.movementCount += 1;
}

async function seedOpeningStock(client, ctx) {
  const openedAt = daysAgo(ctx.asOf, 150);
  for (const product of ctx.products) {
    const base = product.reorder_level;
    const quantity = product.low
      ? round3(base * (0.3 + ctx.rng() * 0.4))
      : round3(base * (2 + ctx.rng() * 2));
    await insertMovement(client, ctx, {
      product_id: product.id,
      warehouse_id: product.warehouse_id,
      movement_type: "stock_in",
      quantity,
      unit_cost: product.cost_price,
      reference: "OPENING",
      reason: "Opening stock",
      created_by: ctx.users.storeManager,
      created_at: openedAt,
    });
  }
}

async function seedPurchaseOrders(client, ctx) {
  const nonLow = ctx.products.filter((p) => !p.low);
  let poSeq = 1;

  for (let i = 0; i < 9; i += 1) {
    const status = PO_STATUSES[i % PO_STATUSES.length];
    const supplierId = pick(ctx.rng, ctx.suppliers);
    const warehouseId = pick(ctx.rng, ctx.warehouses);
    const orderedDaysAgo = randInt(ctx.rng, 20, 140);
    const orderDate = daysAgo(ctx.asOf, orderedDaysAgo);
    const expectedDate = daysAgo(ctx.asOf, orderedDaysAgo - 7);

    const lineCount = randInt(ctx.rng, 2, 4);
    const chosen = new Set();
    const lines = [];
    while (lines.length < lineCount) {
      const product = pick(ctx.rng, nonLow);
      if (chosen.has(product.id)) continue;
      chosen.add(product.id);
      const quantityOrdered = round3(randInt(ctx.rng, 5, 30));
      const unitCost = round2(product.cost_price * (0.95 + ctx.rng() * 0.15));
      lines.push({
        product,
        quantityOrdered,
        unitCost,
        lineTotal: round2(quantityOrdered * unitCost),
      });
    }

    const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));
    const tax = round2((subtotal * ctx.taxRate) / 100);
    const total = round2(subtotal + tax);

    const year = orderDate.getFullYear();
    const poNumber = `PO-${year}-${String(poSeq).padStart(6, "0")}`;
    const receivedDate = status === "received" || status === "partially_received"
      ? daysAgo(ctx.asOf, Math.max(1, orderedDaysAgo - 10))
      : null;

    const { id: poId } = await insert(client, "purchase_orders", {
      po_number: poNumber,
      supplier_id: supplierId,
      warehouse_id: warehouseId,
      status,
      order_date: toDateOnly(orderDate),
      expected_date: toDateOnly(expectedDate),
      received_date: receivedDate ? toDateOnly(receivedDate) : null,
      subtotal,
      tax,
      total,
      notes: null,
      created_by: ctx.users.storeManager,
      created_at: orderDate,
    });
    poSeq += 1;
    ctx.poCount += 1;

    for (const line of lines) {
      let quantityReceived = 0;
      if (status === "received") quantityReceived = line.quantityOrdered;
      else if (status === "partially_received") quantityReceived = round3(line.quantityOrdered / 2);

      await insert(client, "purchase_order_items", {
        purchase_order_id: poId,
        product_id: line.product.id,
        quantity_ordered: line.quantityOrdered,
        quantity_received: quantityReceived,
        unit_cost: line.unitCost,
        line_total: line.lineTotal,
      });

      // Received quantities enter the ledger as stock_in against this PO.
      if (quantityReceived > 0) {
        await insertMovement(client, ctx, {
          product_id: line.product.id,
          warehouse_id: warehouseId,
          movement_type: "stock_in",
          quantity: quantityReceived,
          unit_cost: line.unitCost,
          reference: poNumber,
          reason: "Purchase order received",
          created_by: ctx.users.storeManager,
          created_at: receivedDate,
        });
      }
    }
  }
}

async function seedAdjustments(client, ctx) {
  // A few wastage/stock_out movements on well-stocked products only, so no
  // balance is driven negative and low-stock products stay low.
  const nonLow = ctx.products.filter((p) => !p.low);
  for (let i = 0; i < 6; i += 1) {
    const product = pick(ctx.rng, nonLow);
    const type = chance(ctx.rng, 0.5) ? "wastage" : "stock_out";
    await insertMovement(client, ctx, {
      product_id: product.id,
      warehouse_id: product.warehouse_id,
      movement_type: type,
      quantity: round3(1 + ctx.rng() * 3),
      unit_cost: product.cost_price,
      reference: null,
      reason: type === "wastage" ? "Damaged in storage" : "Issued to kitchen",
      created_by: ctx.users.storeManager,
      created_at: daysAgo(ctx.asOf, randInt(ctx.rng, 1, 60)),
    });
  }
}

async function reconcileProductStock(client) {
  // Set each product's current_stock to the signed sum of its movements.
  await client.query(`
    UPDATE products p
    SET current_stock = COALESCE(m.net, 0)
    FROM (
      SELECT product_id,
             SUM(CASE WHEN movement_type IN ('stock_in', 'transfer')
                      THEN quantity ELSE -quantity END) AS net
      FROM stock_movements
      GROUP BY product_id
    ) m
    WHERE p.id = m.product_id;
  `);
}

async function seedPurchasing(client, ctx) {
  ctx.movementCount = 0;
  ctx.poCount = 0;
  await seedOpeningStock(client, ctx);
  await seedPurchaseOrders(client, ctx);
  await seedAdjustments(client, ctx);
  await reconcileProductStock(client);
}

module.exports = { seedPurchasing };
