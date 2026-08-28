-- Phase 5.3 — Que Warehouse Worker job queue (per-workspace orchestration)

CREATE TABLE IF NOT EXISTS warehouse_job_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  kind            TEXT NOT NULL DEFAULT 'job_run'
                  CHECK (kind IN ('job_run', 'sync', 'studio_refresh')),
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  priority        INT NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  payload_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  job_id          UUID REFERENCES jobs (id) ON DELETE SET NULL,
  run_id          UUID,
  worker_id       TEXT,
  trigger_source  TEXT NOT NULL DEFAULT 'manual',
  attempt         INT NOT NULL DEFAULT 0,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wh_queue_ws_status
  ON warehouse_job_queue (workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wh_queue_claim
  ON warehouse_job_queue (status, priority, created_at)
  WHERE status = 'queued';
