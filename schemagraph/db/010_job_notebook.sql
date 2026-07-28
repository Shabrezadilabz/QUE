-- Job notebooks — ordered cells (markdown | sql) persisted on jobs.
-- Legacy sql_text / steps / notes remain; notebook is the interactive source of truth going forward.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS notebook_json JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN jobs.notebook_json IS
  'Que notebook cells: [{ id, kind: markdown|sql, title?, content }]. Empty array means derive on read until backfilled.';
