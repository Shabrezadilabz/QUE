-- Sprint 8 — plane planned kind, column PII meta, materialize queue status

ALTER TABLE plane_activity_events DROP CONSTRAINT IF EXISTS plane_activity_events_kind_check;
ALTER TABLE plane_activity_events
  ADD CONSTRAINT plane_activity_events_kind_check
  CHECK (kind IN (
    'created', 'drafted', 'edited', 'executed', 'landed', 'certified', 'failed', 'planned'
  ));

ALTER TABLE schema_columns
  ADD COLUMN IF NOT EXISTS meta_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS schema_columns_meta_gin_idx
  ON schema_columns USING gin (meta_json);

ALTER TABLE job_materializations DROP CONSTRAINT IF EXISTS job_materializations_status_check;
ALTER TABLE job_materializations
  ADD CONSTRAINT job_materializations_status_check
  CHECK (status IN ('planned', 'succeeded', 'failed'));

COMMENT ON COLUMN schema_columns.meta_json IS
  'Steward tags — piiTags[], access labels; does not rewrite warehouse columns';
