-- Que P0.2/P0.3 — export attestation audit trail

CREATE TABLE IF NOT EXISTS export_audit_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  job_id            UUID REFERENCES jobs (id) ON DELETE SET NULL,
  actor_user_id     UUID REFERENCES users (id) ON DELETE SET NULL,
  format            TEXT NOT NULL,
  attestation_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  fingerprint       TEXT,
  github_opened     BOOLEAN NOT NULL DEFAULT false,
  github_pr_url     TEXT,
  meta_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS export_audit_events_ws_created_idx
  ON export_audit_events (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS export_audit_events_job_idx
  ON export_audit_events (job_id, created_at DESC);

COMMENT ON TABLE export_audit_events IS
  'Schema-only attestation attached to every job export (CISO audit trail)';
