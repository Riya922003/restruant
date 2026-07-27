const { pool } = require("../../config/database");
const { toNum } = require("../../utils/serialize");

// Per-role allowlist of entity types shown in the feed. Owner and manager
// oversee everything (no filter); other roles see only events relevant to their
// work. Server-enforced; the bell is not a security boundary but this keeps the
// feed useful and scoped.
const ROLE_ENTITY_TYPES = {
  store_manager: [
    "product",
    "product_category",
    "warehouse",
    "stock_movement",
    "ingredient",
    "purchase_order",
    "supplier",
    "supplier_invoice",
    "invoice_import",
    "invoice",
    "expense",
    "expense_category",
  ],
  chef: ["order", "recipe", "menu_item", "menu_category"],
  waiter: ["order", "table"],
  cashier: ["order", "expense"],
};

const FEED_LIMIT = 20;

function mapItem(row) {
  return {
    id: toNum(row.id),
    action: row.action,
    entity_type: row.entity_type,
    entity_id: toNum(row.entity_id),
    actor_name: row.actor_name,
    metadata: row.metadata,
    created_at: row.created_at,
  };
}

async function getFeed(user) {
  const u = await pool.query("SELECT notifications_seen_at FROM users WHERE id = $1", [user.id]);
  const seenAt = u.rows[0]?.notifications_seen_at ?? null;

  // Exports are the caller's own downloads, not noteworthy events; hide them. The bell
  // is also for other people's activity, so do not notify users about their own actions.
  const where = ["a.action NOT LIKE '%.exported'", "a.actor_user_id IS DISTINCT FROM $1"];
  const params = [user.id];
  const allowed = user.role === "owner" || user.role === "manager" ? null : ROLE_ENTITY_TYPES[user.role];
  if (allowed) {
    params.push(allowed);
    where.push(`a.entity_type = ANY($${params.length})`);
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;

  const items = await pool.query(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.metadata, a.created_at,
            u.full_name AS actor_name
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_user_id
     ${whereSql}
     ORDER BY a.created_at DESC
     LIMIT ${FEED_LIMIT}`,
    params
  );

  let unread;
  if (seenAt) {
    const p = [...params, seenAt];
    const c = await pool.query(
      `SELECT count(*)::int AS n FROM audit_logs a ${whereSql} AND a.created_at > $${p.length}`,
      p
    );
    unread = c.rows[0].n;
  } else {
    // Never opened: everything currently shown is unread.
    unread = items.rows.length;
  }

  return { items: items.rows.map(mapItem), unread_count: unread, seen_at: seenAt };
}

async function markSeen(user) {
  const { rows } = await pool.query(
    "UPDATE users SET notifications_seen_at = now() WHERE id = $1 RETURNING notifications_seen_at",
    [user.id]
  );
  return { seen_at: rows[0]?.notifications_seen_at ?? null };
}

module.exports = { getFeed, markSeen };

