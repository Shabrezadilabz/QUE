-- Monk Mode runs, live events, steward inbox, column profiling (Phase 1)

CREATE TABLE IF NOT EXISTS monk_mode_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  pack_id         TEXT NOT NULL DEFAULT 'ecommerce-v1',
  industry        TEXT NOT NULL DEFAULT 'Ecommerce',
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN (
                    'pending', 'running', 'paused', 'completed',
                    'failed', 'cancelled'
                  )),
  phase           TEXT NOT NULL DEFAULT 'discover'
                  CHECK (phase IN (
                    'discover', 'map', 'clean', 'build', 'certify', 'done'
                  )),
  match_score     NUMERIC(5, 2),
  capability_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message   TEXT,
  started_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS monk_mode_runs_ws_status_idx
  ON monk_mode_runs (workspace_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS monk_mode_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID NOT NULL REFERENCES monk_mode_runs(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  phase         TEXT NOT NULL,
  level         TEXT NOT NULL DEFAULT 'info'
                CHECK (level IN ('info', 'success', 'warn', 'error')),
  message       TEXT NOT NULL,
  detail_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS monk_mode_events_run_idx
  ON monk_mode_events (run_id, created_at ASC);

CREATE TABLE IF NOT EXISTS steward_inbox_issues (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id          UUID REFERENCES monk_mode_runs(id) ON DELETE SET NULL,
  issue_kind      TEXT NOT NULL DEFAULT 'quality'
                  CHECK (issue_kind IN (
                    'quality', 'join', 'mapping', 'drift', 'fix_proposal'
                  )),
  severity        TEXT NOT NULL DEFAULT 'medium'
                  CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN (
                    'open', 'in_review', 'approved', 'rejected', 'resolved'
                  )),
  title           TEXT NOT NULL,
  description     TEXT,
  table_name      TEXT,
  column_name     TEXT,
  proposal_sql    TEXT,
  proposal_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS steward_inbox_ws_status_idx
  ON steward_inbox_issues (workspace_id, status, severity, updated_at DESC);

CREATE TABLE IF NOT EXISTS column_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  schema_object_id  UUID REFERENCES schema_objects(id) ON DELETE CASCADE,
  table_name        TEXT NOT NULL,
  column_name       TEXT NOT NULL,
  data_type         TEXT,
  null_rate         NUMERIC(8, 4),
  distinct_count    BIGINT,
  sample_values     JSONB NOT NULL DEFAULT '[]'::jsonb,
  profile_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  profiled_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, table_name, column_name)
);

CREATE INDEX IF NOT EXISTS column_profiles_ws_table_idx
  ON column_profiles (workspace_id, table_name);
