-- Que SaaS Wave 4.4 — column alias suggestions (HITL rename assist)

CREATE TABLE IF NOT EXISTS column_alias_suggestions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  from_column_id UUID NOT NULL REFERENCES schema_columns (id) ON DELETE CASCADE,
  to_column_id  UUID NOT NULL REFERENCES schema_columns (id) ON DELETE CASCADE,
  suggested_alias TEXT NOT NULL,
  score         DOUBLE PRECISION,
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'suggested'
                CHECK (status IN ('suggested', 'accepted', 'rejected', 'dismissed')),
  evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, from_column_id, to_column_id, suggested_alias)
);

CREATE INDEX IF NOT EXISTS column_alias_suggestions_ws_status_idx
  ON column_alias_suggestions (workspace_id, status);

COMMENT ON TABLE column_alias_suggestions IS
  'Wave 4.4 — HITL rename suggestions only; never auto-applied';
