-- =============================================================================
-- Stitch jobs — draft → ready → exported (minimal runner)
-- =============================================================================

CREATE TABLE IF NOT EXISTS jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'ready', 'exported', 'archived')),
  sources       JSONB NOT NULL DEFAULT '[]'::jsonb,
  tables        JSONB NOT NULL DEFAULT '[]'::jsonb,
  steps         JSONB NOT NULL DEFAULT '[]'::jsonb,
  sql_text      TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_workspace
  ON jobs (workspace_id, updated_at DESC);
