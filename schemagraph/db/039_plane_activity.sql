-- Sprint 2 — Managed Plane activity feed (server-side audit for handoffs + runs)

CREATE TABLE IF NOT EXISTS plane_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'created', 'drafted', 'edited', 'executed', 'landed', 'certified', 'failed'
  )),
  source TEXT NOT NULL CHECK (source IN (
    'chat', 'plane_sql', 'plane_nlp', 'job', 'source_sync', 'system'
  )),
  actor TEXT NOT NULL DEFAULT 'system' CHECK (actor IN (
    'user', 'ai_chat', 'ssm', 'system'
  )),
  title TEXT NOT NULL,
  detail TEXT,
  sql_text TEXT,
  sql_hash TEXT,
  dataset_id UUID,
  connection_id UUID,
  row_count INT,
  duration_ms INT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plane_activity_ws_created_idx
  ON plane_activity_events (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS plane_activity_ws_unread_idx
  ON plane_activity_events (workspace_id, read_at)
  WHERE read_at IS NULL;

COMMENT ON TABLE plane_activity_events IS
  'Managed Plane activity — SQL drafts, runs, chat handoffs; row payloads never stored here';
