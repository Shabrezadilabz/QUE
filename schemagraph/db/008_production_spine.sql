-- Production spine: contract freeze on jobs, drift events, contract event outbox
-- Apply after 007_ai_rag.sql

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS schema_snapshot_id UUID REFERENCES schema_snapshots(id) ON DELETE SET NULL;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS contract_json JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN jobs.schema_snapshot_id IS
  'Schema snapshot pinned at job create / re-freeze';
COMMENT ON COLUMN jobs.contract_json IS
  'Frozen stitch contract: tables+column types + promoted joins + snapshot meta';

CREATE TABLE IF NOT EXISTS workspace_drift_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_id   UUID REFERENCES connections(id) ON DELETE SET NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'high')),
  code            TEXT NOT NULL,
  summary         TEXT NOT NULL,
  detail_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  acknowledged    BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_drift_events_ws_idx
  ON workspace_drift_events (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workspace_drift_events_open_idx
  ON workspace_drift_events (workspace_id)
  WHERE acknowledged = false AND severity = 'high';

CREATE TABLE IF NOT EXISTS contract_event_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  payload_json    JSONB NOT NULL,
  delivered       BOOLEAN NOT NULL DEFAULT false,
  delivery_error  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS contract_event_outbox_pending_idx
  ON contract_event_outbox (created_at)
  WHERE delivered = false;
