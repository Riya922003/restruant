const { pool } = require("../../config/database");
const { toNum } = require("../../utils/serialize");

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// Per-month totals with a per-category breakdown for a whole year.
async function monthly(year) {
  const targetYear = year ?? new Date().getFullYear();

  const { rows } = await pool.query(
    `SELECT s.month, s.category_id, ec.name AS category_name, s.record_count, s.total_amount
       FROM monthly_expense_summary s
       JOIN expense_categories ec ON ec.id = s.category_id
      WHERE date_part('year', s.month) = $1
      ORDER BY s.month`,
    [targetYear]
  );

  // Group ascending by month string (yyyy-mm-dd).
  const byMonth = new Map();
  for (const row of rows) {
    const month = row.month;
    if (!byMonth.has(month)) {
      byMonth.set(month, {
        month,
        total_amount: 0,
        record_count: 0,
        by_category: [],
      });
    }
    const bucket = byMonth.get(month);
    const amount = Number(row.total_amount);
    const count = Number(row.record_count);
    bucket.total_amount += amount;
    bucket.record_count += count;
    bucket.by_category.push({
      category_id: toNum(row.category_id),
      category_name: row.category_name,
      total_amount: round2(amount),
      record_count: count,
    });
  }

  let yearTotal = 0;
  const grouped = [];
  for (const bucket of byMonth.values()) {
    yearTotal += bucket.total_amount;
    grouped.push({
      month: bucket.month,
      total_amount: round2(bucket.total_amount),
      record_count: bucket.record_count,
      by_category: bucket.by_category,
    });
  }

  return { rows: grouped, meta: { year: targetYear, total_amount: round2(yearTotal) } };
}

// Single-month per-category detail.
async function monthSummary(month) {
  const firstDay = `${month}-01`;

  const { rows } = await pool.query(
    `SELECT s.month, s.category_id, ec.name AS category_name, s.record_count, s.total_amount
       FROM monthly_expense_summary s
       JOIN expense_categories ec ON ec.id = s.category_id
      WHERE s.month = $1
      ORDER BY ec.name`,
    [firstDay]
  );

  let total = 0;
  const byCategory = rows.map((row) => {
    const amount = Number(row.total_amount);
    total += amount;
    return {
      category_id: toNum(row.category_id),
      category_name: row.category_name,
      total_amount: round2(amount),
      record_count: Number(row.record_count),
    };
  });

  return { rows: byCategory, meta: { month: firstDay, total_amount: round2(total) } };
}

module.exports = { monthly, monthSummary };
