-- Wave 2.1 — ensure join evidence column exists for review inbox
ALTER TABLE relationships
  ADD COLUMN IF NOT EXISTS evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN relationships.evidence_json IS
  'Wave 2.1 — multi-signal join evidence shown in Join Review inbox';
