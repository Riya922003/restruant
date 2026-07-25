-- Reporting view that powers Monthly Expense Tracking and the dashboard
-- Monthly Expenses widget.

CREATE VIEW monthly_expense_summary AS
SELECT
  date_trunc('month', expense_date)::date AS month,
  category_id,
  count(*)    AS record_count,
  sum(amount) AS total_amount
FROM expense_records
GROUP BY 1, 2;
