-- Phase 3 — Cursor loop: validation suites + drift fix suggestions
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS validation_suite_json JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN jobs.validation_suite_json IS
  'Phase 3 — generated warehouse validation checks (SQL snippets + last run status)';

CREATE TABLE IF NOT EXISTS drift_fix_suggestions (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  drift_event_id UUID REFERENCES workspace_drift_events(id) ON DELETE SET NULL,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'remap',
  status TEXT NOT NULL DEFAULT 'proposed',
  summary TEXT NOT NULL,
  proposal_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_drift_fix_ws_status
  ON drift_fix_suggestions (workspace_id, status, created_at DESC);

-- Extend agent sessions with tool transcript column (optional; also in result_json)
ALTER TABLE stitch_agent_sessions
  ADD COLUMN IF NOT EXISTS tool_calls_json JSONB NOT NULL DEFAULT '[]'::jsonb;
