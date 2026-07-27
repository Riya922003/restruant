-- Track when each user last opened their notification feed, so the unread count
-- can be computed against the audit_logs event stream. Null means never opened.
ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_seen_at timestamptz;
