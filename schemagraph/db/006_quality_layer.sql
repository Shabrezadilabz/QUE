-- =============================================================================
-- Que quality layer: explainable join evidence + frozen job joins
-- Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- =============================================================================

ALTER TABLE relationships
  ADD COLUMN IF NOT EXISTS evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS relationship_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS joins_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN relationships.evidence_json IS
  'Explainable confidence signals (name/type/key/sample/prior approvals)';
COMMENT ON COLUMN jobs.relationship_ids IS
  'Frozen accepted relationship UUIDs at job create/export';
COMMENT ON COLUMN jobs.joins_snapshot IS
  'Frozen join details for reproducible dbt export';
