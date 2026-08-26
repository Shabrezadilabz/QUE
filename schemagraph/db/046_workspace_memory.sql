-- Phase 4: workspace memory from steward approvals + Monk agent

CREATE TABLE IF NOT EXISTS workspace_memory_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entry_kind      TEXT NOT NULL DEFAULT 'hint',
  entry_key       TEXT NOT NULL,
  value_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  source          TEXT NOT NULL DEFAULT 'monk_mode',
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, entry_kind, entry_key)
);

CREATE INDEX IF NOT EXISTS workspace_memory_ws_idx
  ON workspace_memory_entries (workspace_id, entry_kind, updated_at DESC);
