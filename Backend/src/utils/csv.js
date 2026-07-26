// Minimal, dependency-free CSV builder for list exports.

// UTF-8 byte order mark so spreadsheets open Unicode (and rupee amounts)
// correctly. Built from the code point to avoid an invisible literal in source.
const BOM = String.fromCharCode(0xfeff);

// Escape one cell: wrap in double quotes when it contains a comma, quote, or
// newline, doubling any embedded quotes. null/undefined become empty.
function escapeCell(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// columns: [{ key, header, map? }]. `map(value, row)` is optional per column.
// rows: array of plain objects. Returns a CSV string prefixed with the BOM.
function toCsv(columns, rows) {
  const header = columns.map((c) => escapeCell(c.header ?? c.key)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => escapeCell(c.map ? c.map(row[c.key], row) : row[c.key])).join(",")
  );
  return BOM + [header, ...body].join("\r\n");
}

// Send a CSV string as a downloadable attachment.
function sendCsv(res, filename, csv) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}

module.exports = { toCsv, sendCsv };
