-- P1: connector reliability, SaaS backup/DR, golden eval schedule, warehouse digests

ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS sync_retry_max INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS sync_retry_backoff_sec INT NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS sync_checkpoint_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sync_attempt INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sync_duration_ms INT;

COMMENT ON COLUMN connections.sync_checkpoint_json IS
  'Resumable sync checkpoint (phase, cursor, partial counts)';

CREATE TABLE IF NOT EXISTS warehouse_run_digests (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'external',
  -- external | databricks | snowflake | private_runner
  summary TEXT NOT NULL DEFAULT '',
  failed_count INT NOT NULL DEFAULT 0,
  succeeded_count INT NOT NULL DEFAULT 0,
  runs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouse_digests_ws
  ON warehouse_run_digests (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workspace_backup_snapshots (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'metadata',
  -- metadata | full_export
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  bytes_estimate BIGINT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backup_snapshots_ws
  ON workspace_backup_snapshots (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dr_drill_runs (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'passed',
  summary TEXT NOT NULL DEFAULT '',
  evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dr_drills_ws
  ON dr_drill_runs (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS golden_eval_schedules (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  interval_hours INT NOT NULL DEFAULT 24,
  pairs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_run_at TIMESTAMPTZ,
  last_recall DOUBLE PRECISION,
  last_report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  next_run_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE warehouse_run_digests IS
  'Offer A — aggregated customer-hosted / external job failure digests';
COMMENT ON TABLE workspace_backup_snapshots IS
  'SaaS metadata backup snapshots for DR evidence';
COMMENT ON TABLE dr_drill_runs IS
  'Recorded DR drills for compliance ops checklist';
COMMENT ON TABLE golden_eval_schedules IS
  'Scheduled golden-set join eval per workspace';
