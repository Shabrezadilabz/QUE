-- CEO P0: Outcome plans + ship events (rollback/attestation)
-- Schema-first: no lake row custody in these tables.

CREATE TABLE IF NOT EXISTS workspace_outcomes (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  plan_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_outcomes_ws
  ON workspace_outcomes (workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS workspace_ship_events (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  outcome_id UUID REFERENCES workspace_outcomes(id) ON DELETE SET NULL,
  chart_id UUID,
  embed_token_id UUID,
  status TEXT NOT NULL DEFAULT 'draft',
  title TEXT NOT NULL DEFAULT '',
  attestation_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  rolled_back_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_ship_events_ws
  ON workspace_ship_events (workspace_id, created_at DESC);
