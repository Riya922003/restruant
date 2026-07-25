function getPagination(query) {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

function buildMeta(page, limit, total) {
  const totalNum = Number(total);
  return {
    page,
    limit,
    total: totalNum,
    totalPages: Math.max(1, Math.ceil(totalNum / limit)),
  };
}

// Turn a client `sort` value ("name" or "-created_at") into a safe ORDER BY
// fragment. Only whitelisted columns are honored; anything else falls back to
// the default. Column identifiers come from the whitelist, never from raw input.
function parseSort(sort, whitelist, defaultOrderBy) {
  if (!sort || typeof sort !== "string") return defaultOrderBy;
  const desc = sort.startsWith("-");
  const column = desc ? sort.slice(1) : sort;
  if (!whitelist.includes(column)) return defaultOrderBy;
  return `${column} ${desc ? "DESC" : "ASC"}`;
}

module.exports = { getPagination, buildMeta, parseSort };
