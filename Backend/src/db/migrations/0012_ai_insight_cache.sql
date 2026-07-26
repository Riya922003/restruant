-- Phase 2: cache the latest generated AI recommendation per feature so the
-- dashboard can display insights without re-calling the model. One row per
-- feature (upserted on each generate); result is the full endpoint payload.

CREATE TABLE ai_insight_cache (
  feature      text PRIMARY KEY,
  result       jsonb NOT NULL,
  generated_by bigint REFERENCES users (id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);
