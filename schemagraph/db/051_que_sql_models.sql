-- Que Model IDE — SQL models (staging / mart) per workspace

CREATE TABLE IF NOT EXISTS que_sql_models (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  layer           TEXT NOT NULL DEFAULT 'staging'
                  CHECK (layer IN ('staging', 'mart', 'seed')),
  sql_text        TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  depends_on      TEXT[] NOT NULL DEFAULT '{}',
  materialization TEXT NOT NULL DEFAULT 'view'
                  CHECK (materialization IN ('view', 'table', 'incremental')),
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'ready', 'archived')),
  last_run_at     TIMESTAMPTZ,
  last_run_status TEXT,
  last_run_rows   INT,
  config_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by      UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_que_sql_models_ws
  ON que_sql_models (workspace_id, layer, updated_at DESC);
