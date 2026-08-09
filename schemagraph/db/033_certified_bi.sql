-- Production: certified BI charts + revocable embed tokens

CREATE TABLE IF NOT EXISTS bi_charts (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  chart_type TEXT NOT NULL DEFAULT 'table',
  dataset_id UUID REFERENCES managed_datasets(id) ON DELETE SET NULL,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  certified BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bi_charts_ws
  ON bi_charts (workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS bi_embed_tokens (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  chart_id UUID NOT NULL REFERENCES bi_charts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bi_embed_chart
  ON bi_embed_tokens (workspace_id, chart_id);

COMMENT ON TABLE bi_charts IS
  'Certified BI charts bound to managed datasets; embed requires certification';
COMMENT ON TABLE bi_embed_tokens IS
  'Opaque hashed embed tokens for certified BI charts';
