// pg returns bigint and numeric columns as strings. The API exposes them as
// JS numbers for clean JSON (values in this app are well within safe range).
function toNum(value) {
  return value === null || value === undefined ? value : Number(value);
}

module.exports = { toNum };
