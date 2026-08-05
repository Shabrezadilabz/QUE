-- Que SaaS Wave 1.1 — unified workspace audit log
-- Covers: roles, invites, sync, join promote/reject, exports, secrets, settings

CREATE TABLE IF NOT EXISTS workspace_audit_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  summary       TEXT,
  meta_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_audit_events_ws_created_idx
  ON workspace_audit_events (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workspace_audit_events_action_idx
  ON workspace_audit_events (workspace_id, action, created_at DESC);

COMMENT ON TABLE workspace_audit_events IS
  'Wave 1.1 — unified SaaS audit trail for security / diligence reviews';
