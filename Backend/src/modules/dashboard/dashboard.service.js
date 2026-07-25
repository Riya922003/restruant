const { pool } = require("../../config/database");
const { toNum } = require("../../utils/serialize");

// Resolve a validated range enum to a concrete boundary timestamp, computed in
// the DB so it uses the server clock/timezone. `range` is one of three fixed
// literals from the Zod enum (never raw client input); every widget query then
// takes the resolved boundary as a bound `$1` parameter.
async function resolveBoundary(range) {
  let expr;
  if (range === "7d") expr = "now() - interval '7 days'";
  else if (range === "month") expr = "date_trunc('month', now())";
  else expr = "now() - interval '30 days'"; // 30d default
  const { rows } = await pool.query(`SELECT ${expr} AS boundary`);
  return rows[0].boundary;
}

// --- Widget 1: Sales Overview -------------------------------------------------
async function salesOverview(boundary) {
  const headline = await pool.query(
    `SELECT
       coalesce(sum(total), 0)            AS total_sales,
       count(*)                           AS order_count,
       coalesce(round(avg(total), 2), 0)  AS average_order_value
     FROM orders
     WHERE payment_status = 'paid' AND status <> 'cancelled' AND created_at >= $1`,
    [boundary]
  );
  const series = await pool.query(
    `SELECT date_trunc('day', created_at)::date AS day,
            coalesce(sum(total), 0)             AS sales,
            count(*)                            AS orders
     FROM orders
     WHERE payment_status = 'paid' AND status <> 'cancelled' AND created_at >= $1
     GROUP BY 1 ORDER BY 1 ASC`,
    [boundary]
  );
  const h = headline.rows[0];
  return {
    total_sales: toNum(h.total_sales),
    order_count: toNum(h.order_count),
    average_order_value: toNum(h.average_order_value),
    series: series.rows.map((r) => ({
      day: r.day,
      sales: toNum(r.sales),
      orders: toNum(r.orders),
    })),
  };
}

// --- Widget 2: Active Orders (live) ------------------------------------------
async function activeOrders() {
  const ACTIVE = "('open','sent_to_kitchen','preparing','ready','served')";
  const count = await pool.query(
    `SELECT count(*) AS active_count FROM orders WHERE status IN ${ACTIVE}`
  );
  const list = await pool.query(
    `SELECT o.id, o.order_number, o.status, o.order_type, o.total, o.created_at,
            t.label AS table_label
     FROM orders o
     LEFT JOIN restaurant_tables t ON t.id = o.table_id
     WHERE o.status IN ${ACTIVE}
     ORDER BY o.created_at ASC
     LIMIT 20`
  );
  return {
    active_count: toNum(count.rows[0].active_count),
    orders: list.rows.map((r) => ({
      id: toNum(r.id),
      order_number: r.order_number,
      status: r.status,
      order_type: r.order_type,
      total: toNum(r.total),
      table_label: r.table_label,
      created_at: r.created_at,
    })),
  };
}

// --- Widget 3: Table Occupancy (live) ----------------------------------------
async function tableOccupancy() {
  const { rows } = await pool.query(
    `SELECT
       count(*)                                            AS total,
       count(*) FILTER (WHERE status = 'occupied')         AS occupied,
       count(*) FILTER (WHERE status = 'available')        AS available,
       count(*) FILTER (WHERE status = 'reserved')         AS reserved,
       count(*) FILTER (WHERE status = 'out_of_service')   AS out_of_service,
       round(100.0 * count(*) FILTER (WHERE status = 'occupied')
             / nullif(count(*), 0), 1)                     AS occupancy_pct
     FROM restaurant_tables`
  );
  const r = rows[0];
  return {
    total: toNum(r.total),
    occupied: toNum(r.occupied),
    available: toNum(r.available),
    reserved: toNum(r.reserved),
    out_of_service: toNum(r.out_of_service),
    occupancy_pct: toNum(r.occupancy_pct),
  };
}

// --- Widget 4: Low Stock Items (live) ----------------------------------------
async function lowStock() {
  const base = `
    SELECT 'ingredient'::text AS source, i.id, i.name, NULL::text AS sku,
           i.current_stock, i.reorder_level, i.unit
    FROM ingredients i
    WHERE i.is_active = true AND i.current_stock <= i.reorder_level
    UNION ALL
    SELECT 'product'::text AS source, p.id, p.name, p.sku,
           p.current_stock, p.reorder_level, p.unit
    FROM products p
    WHERE p.is_active = true AND p.current_stock <= p.reorder_level`;

  const count = await pool.query(`SELECT count(*) AS low_stock_count FROM (${base}) q`);
  // Wrap the UNION: Postgres forbids expressions in a UNION-level ORDER BY.
  const items = await pool.query(
    `SELECT * FROM (${base}) q ORDER BY (q.reorder_level - q.current_stock) DESC LIMIT 50`
  );
  return {
    low_stock_count: toNum(count.rows[0].low_stock_count),
    items: items.rows.map((r) => ({
      source: r.source,
      id: toNum(r.id),
      name: r.name,
      sku: r.sku,
      current_stock: toNum(r.current_stock),
      reorder_level: toNum(r.reorder_level),
      unit: r.unit,
    })),
  };
}

// --- Widget 5: Monthly Expenses (current calendar year) ----------------------
async function monthlyExpenses() {
  const months = await pool.query(
    `SELECT month, sum(total_amount) AS total_amount, sum(record_count) AS record_count
     FROM monthly_expense_summary
     WHERE month >= date_trunc('year', now())::date
     GROUP BY month ORDER BY month ASC`
  );
  const current = await pool.query(
    `SELECT coalesce(sum(amount), 0) AS current_month_total
     FROM expense_records
     WHERE expense_date >= date_trunc('month', now())::date`
  );
  const year = await pool.query(`SELECT extract(year FROM now())::int AS year`);
  return {
    year: toNum(year.rows[0].year),
    current_month_total: toNum(current.rows[0].current_month_total),
    months: months.rows.map((r) => ({
      month: r.month,
      total_amount: toNum(r.total_amount),
      record_count: toNum(r.record_count),
    })),
  };
}

// --- Widget 6: Purchase Summary ----------------------------------------------
async function purchaseSummary(boundary) {
  const byStatus = await pool.query(
    `SELECT status, count(*) AS po_count, coalesce(sum(total), 0) AS total_value
     FROM purchase_orders WHERE created_at >= $1 GROUP BY status`,
    [boundary]
  );
  const totalValue = await pool.query(
    `SELECT coalesce(sum(total), 0) AS total_po_value
     FROM purchase_orders WHERE created_at >= $1 AND status <> 'cancelled'`,
    [boundary]
  );
  const outstanding = await pool.query(
    `SELECT coalesce(sum((poi.quantity_ordered - poi.quantity_received) * poi.unit_cost), 0)
              AS outstanding_value
     FROM purchase_order_items poi
     JOIN purchase_orders po ON po.id = poi.purchase_order_id
     WHERE po.status IN ('ordered', 'partially_received')`
  );
  return {
    total_po_value: toNum(totalValue.rows[0].total_po_value),
    outstanding_value: toNum(outstanding.rows[0].outstanding_value),
    by_status: byStatus.rows.map((r) => ({
      status: r.status,
      po_count: toNum(r.po_count),
      total_value: toNum(r.total_value),
    })),
  };
}

// --- Widget 7: Profit Overview -----------------------------------------------
async function profit(boundary) {
  const { rows } = await pool.query(
    `WITH paid_orders AS (
       SELECT id, total FROM orders
       WHERE payment_status = 'paid' AND status <> 'cancelled' AND created_at >= $1
     ),
     revenue AS (SELECT coalesce(sum(total), 0) AS total_revenue FROM paid_orders),
     cost AS (
       SELECT coalesce(sum(oi.quantity * coalesce(mi.cost, 0)), 0) AS total_cost
       FROM order_items oi
       JOIN paid_orders po ON po.id = oi.order_id
       JOIN menu_items mi  ON mi.id = oi.menu_item_id
     )
     SELECT revenue.total_revenue,
            cost.total_cost,
            (revenue.total_revenue - cost.total_cost) AS gross_profit,
            round(100.0 * (revenue.total_revenue - cost.total_cost)
                  / nullif(revenue.total_revenue, 0), 1) AS margin_pct
     FROM revenue, cost`,
    [boundary]
  );
  const r = rows[0];
  return {
    total_revenue: toNum(r.total_revenue),
    total_cost: toNum(r.total_cost),
    gross_profit: toNum(r.gross_profit),
    margin_pct: toNum(r.margin_pct),
  };
}

// --- Widget 8: Supplier Summary ----------------------------------------------
async function supplierSummary(boundary) {
  const active = await pool.query(
    `SELECT count(*) AS active_supplier_count FROM suppliers WHERE is_active = true`
  );
  const top = await pool.query(
    `SELECT s.id, s.name, coalesce(sum(si.total), 0) AS total_spend, count(si.id) AS invoice_count
     FROM suppliers s
     JOIN supplier_invoices si ON si.supplier_id = s.id
     WHERE si.invoice_date >= $1
     GROUP BY s.id, s.name
     ORDER BY total_spend DESC
     LIMIT 5`,
    [boundary]
  );
  const outstanding = await pool.query(
    `SELECT coalesce(sum(total), 0) AS outstanding_invoice_total
     FROM supplier_invoices WHERE status <> 'paid'`
  );
  return {
    active_supplier_count: toNum(active.rows[0].active_supplier_count),
    outstanding_invoice_total: toNum(outstanding.rows[0].outstanding_invoice_total),
    top_suppliers: top.rows.map((r) => ({
      id: toNum(r.id),
      name: r.name,
      total_spend: toNum(r.total_spend),
      invoice_count: toNum(r.invoice_count),
    })),
  };
}

// --- Combined summary: fan out all 8 widgets concurrently --------------------
async function getSummary(range) {
  const boundary = await resolveBoundary(range);
  const [
    sales_overview,
    active,
    table_occupancy,
    low_stock_items,
    monthly,
    purchase_summary,
    profit_overview,
    supplier_summary,
  ] = await Promise.all([
    salesOverview(boundary),
    activeOrders(),
    tableOccupancy(),
    lowStock(),
    monthlyExpenses(),
    purchaseSummary(boundary),
    profit(boundary),
    supplierSummary(boundary),
  ]);
  return {
    range,
    sales_overview,
    active_orders: active,
    table_occupancy,
    low_stock_items,
    monthly_expenses: monthly,
    purchase_summary,
    profit_overview,
    supplier_summary,
  };
}

module.exports = {
  resolveBoundary,
  salesOverview,
  activeOrders,
  tableOccupancy,
  lowStock,
  monthlyExpenses,
  purchaseSummary,
  profit,
  supplierSummary,
  getSummary,
};
