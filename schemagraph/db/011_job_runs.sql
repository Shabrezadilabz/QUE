-- Job runs — dry-run / future warehouse execution history + process logs

CREATE TABLE IF NOT EXISTS job_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  job_id        UUID NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  scope         TEXT NOT NULL DEFAULT 'all'
                CHECK (scope IN ('all', 'cell')),
  cell_id       TEXT,
  mode          TEXT NOT NULL DEFAULT 'dry_run'
                CHECK (mode IN ('dry_run', 'live')),
  summary       TEXT,
  logs_json     JSONB NOT NULL DEFAULT '[]'::jsonb,
  output_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_runs_job
  ON job_runs (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_runs_workspace
  ON job_runs (workspace_id, created_at DESC);

COMMENT ON TABLE job_runs IS
  'Notebook run history. Step 4 = dry_run (validate + schema samples). Live warehouse exec is later.';
