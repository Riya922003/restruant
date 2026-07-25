// Shared seed helpers: a deterministic PRNG so repeated runs produce the same
// demo data, small random pickers, money/quantity rounding, date math, and a
// generic insert that returns the generated row.

// mulberry32: tiny deterministic PRNG seeded from a constant.
function makeRng(seed = 20260101) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function chance(rng, probability) {
  return rng() < probability;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

// Resolve the "as of" date the demo is anchored to. Fixed via SEED_AS_OF for
// reproducibility, otherwise today.
function resolveAsOf() {
  const raw = process.env.SEED_AS_OF;
  const base = raw ? new Date(raw) : new Date();
  base.setHours(12, 0, 0, 0);
  return base;
}

function daysAgo(asOf, days) {
  const d = new Date(asOf);
  d.setDate(d.getDate() - days);
  return d;
}

// First day of the month that is `n` months before asOf.
function monthsAgoStart(asOf, n) {
  return new Date(asOf.getFullYear(), asOf.getMonth() - n, 1, 12, 0, 0, 0);
}

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

// Generic insert. Pass a plain object keyed by column name; returns the row
// selected by `returning` (defaults to the generated id).
async function insert(client, table, row, returning = "id") {
  const keys = Object.keys(row);
  const cols = keys.map((k) => `"${k}"`).join(", ");
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
  const values = keys.map((k) => row[k]);
  const { rows } = await client.query(
    `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) RETURNING ${returning}`,
    values
  );
  return rows[0];
}

module.exports = {
  makeRng,
  randInt,
  pick,
  chance,
  round2,
  round3,
  resolveAsOf,
  daysAgo,
  monthsAgoStart,
  toDateOnly,
  insert,
};
