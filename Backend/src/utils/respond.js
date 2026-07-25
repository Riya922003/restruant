// Standard success response envelope helpers. Single resource -> { data }.
// Collection -> { data, meta } with pagination info.

function ok(res, data, meta) {
  return res.json(meta ? { data, meta } : { data });
}

function created(res, data) {
  return res.status(201).json({ data });
}

function noContent(res) {
  return res.status(204).send();
}

module.exports = { ok, created, noContent };
