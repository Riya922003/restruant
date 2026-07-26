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

// Parse CSV text into { headers, rows }. rows are objects keyed by the (trimmed)
// header. Handles a leading BOM, quoted fields with embedded commas/newlines,
// doubled quotes, and both CRLF and LF line endings. Fully-blank lines are
// dropped. Missing trailing cells become empty strings.
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records = [];
  let record = [];
  let field = "";
  let inQuotes = false;
  let sawAny = false;

  const endField = () => { record.push(field); field = ""; };
  const endRecord = () => { endField(); records.push(record); record = []; sawAny = false; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') { inQuotes = true; sawAny = true; continue; }
    if (c === ",") { endField(); sawAny = true; continue; }
    if (c === "\r") continue;
    if (c === "\n") { if (sawAny || field.length) endRecord(); else record = []; continue; }
    field += c;
    sawAny = true;
  }
  if (sawAny || field.length) endRecord();

  const nonEmpty = records.filter((r) => r.some((cell) => cell.trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? "").trim(); });
    return obj;
  });
  return { headers, rows };
}

module.exports = { toCsv, sendCsv, parseCsv };
