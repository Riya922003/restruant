const { ApiError } = require("../../utils/api-error");

// Legal invoice_status transitions. paid is terminal (no outgoing edges).
const STATUS_TRANSITIONS = {
  pending: ["verified", "disputed"],
  verified: ["paid", "disputed"],
  disputed: ["verified", "pending"],
  paid: [],
};

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// Optional tax-rate lookup, kept for parity with the PO helpers. Supplier
// invoices carry an explicit tax amount, so this is not used in the flows below.
async function getTaxRate(client) {
  const { rows } = await client.query("SELECT tax_rate FROM restaurant_profile WHERE id = 1");
  return rows[0] ? Number(rows[0].tax_rate) : 0;
}

// Format a value returned by z.coerce.date() (a Date) as a pg date string.
function toDateString(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

// Setting the same status is a no-op; otherwise the target must be reachable.
function assertInvoiceTransition(from, to) {
  if (from === to) return;
  const allowed = STATUS_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw new ApiError(409, "Invalid invoice status transition");
  }
}

module.exports = {
  STATUS_TRANSITIONS,
  round2,
  getTaxRate,
  toDateString,
  assertInvoiceTransition,
};
