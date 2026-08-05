-- Que SaaS Wave 3.1 — opt-in materialize audit (customer warehouse only)

CREATE TABLE IF NOT EXISTS job_materializations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  job_id            UUID NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  connection_id     UUID REFERENCES connections (id) ON DELETE SET NULL,
  actor_user_id     UUID REFERENCES users (id) ON DELETE SET NULL,
  object_kind       TEXT NOT NULL CHECK (object_kind IN ('table', 'view')),
  object_schema     TEXT,
  object_name       TEXT NOT NULL,
  qualified_name    TEXT NOT NULL,
  sql_hash          TEXT,
  status            TEXT NOT NULL DEFAULT 'succeeded'
                    CHECK (status IN ('succeeded', 'failed')),
  error_text        TEXT,
  duration_ms       INT,
  meta_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_materializations_ws_created_idx
  ON job_materializations (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS job_materializations_job_idx
  ON job_materializations (job_id, created_at DESC);

COMMENT ON TABLE job_materializations IS
  'Wave 3.1 — CTAS/VIEW created in customer warehouse; Que stores metadata only (no result rows)';

-- Allow materialize runs in job_runs.mode
ALTER TABLE job_runs DROP CONSTRAINT IF EXISTS job_runs_mode_check;
ALTER TABLE job_runs
  ADD CONSTRAINT job_runs_mode_check
  CHECK (mode IN ('dry_run', 'live', 'materialize'));
