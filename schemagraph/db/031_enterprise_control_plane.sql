-- Phase 5 — Enterprise control plane (Big-4 bar MVP)

CREATE TABLE IF NOT EXISTS workspace_api_keys (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  scopes_json JSONB NOT NULL DEFAULT '["read"]'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_ws
  ON workspace_api_keys (workspace_id, revoked_at);

CREATE TABLE IF NOT EXISTS workspace_scim_tokens (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'scim',
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS abac_policies (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  effect TEXT NOT NULL DEFAULT 'allow',
  actions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  resource_types_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abac_ws
  ON abac_policies (workspace_id, enabled);

CREATE TABLE IF NOT EXISTS workspace_cmk (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  key_id TEXT NOT NULL DEFAULT '',
  wrapped_dek TEXT,
  algorithm TEXT NOT NULL DEFAULT 'aes-256-gcm',
  rotated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS break_glass_events (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_break_glass_ws
  ON break_glass_events (workspace_id, status, expires_at);

CREATE TABLE IF NOT EXISTS siem_export_state (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  last_exported_at TIMESTAMPTZ,
  last_event_id UUID,
  webhook_url TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_isolation_runs (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  checks_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE workspace_api_keys IS
  'Phase 5 — scoped service API keys (least privilege)';
COMMENT ON TABLE workspace_scim_tokens IS
  'Phase 5 — SCIM 2.0 directory sync bearer tokens';
COMMENT ON TABLE abac_policies IS
  'Phase 5 — attribute-based access policies layered on RBAC';
COMMENT ON TABLE workspace_cmk IS
  'Phase 5 — optional customer-managed key envelope for secrets';
COMMENT ON TABLE break_glass_events IS
  'Phase 5 — emergency SSO-bypass access with audit';
COMMENT ON TABLE siem_export_state IS
  'Phase 5 — SIEM continuous export cursor';
COMMENT ON TABLE tenant_isolation_runs IS
  'Phase 5 — automated tenant isolation test results';
