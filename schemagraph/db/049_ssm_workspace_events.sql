-- Phase 2 — SSM-B workspace event log (append-only per workspace)

CREATE TABLE IF NOT EXISTS workspace_event_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  meta_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_event_log_ws_created_idx
  ON workspace_event_log (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workspace_event_log_type_idx
  ON workspace_event_log (workspace_id, event_type, created_at DESC);
