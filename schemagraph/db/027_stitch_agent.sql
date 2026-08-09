-- Phase 1 — Stitch Agent sessions + org join memory
CREATE TABLE IF NOT EXISTS stitch_agent_sessions (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Stitch plan',
  status TEXT NOT NULL DEFAULT 'planning',
  plan_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  checkpoints_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stitch_agent_sessions_ws
  ON stitch_agent_sessions (workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS join_memory (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  from_table TEXT NOT NULL,
  from_column TEXT NOT NULL,
  to_table TEXT NOT NULL,
  to_column TEXT NOT NULL,
  relationship_id UUID REFERENCES relationships(id) ON DELETE SET NULL,
  accepted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, from_table, from_column, to_table, to_column)
);

CREATE INDEX IF NOT EXISTS idx_join_memory_ws ON join_memory (workspace_id);
