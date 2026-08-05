-- Que SaaS Wave 3.3 — signed export artifacts (external download with token)

CREATE TABLE IF NOT EXISTS export_artifacts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  job_id              UUID REFERENCES jobs (id) ON DELETE SET NULL,
  export_audit_id     UUID REFERENCES export_audit_events (id) ON DELETE SET NULL,
  actor_user_id       UUID REFERENCES users (id) ON DELETE SET NULL,
  format              TEXT NOT NULL,
  filename            TEXT NOT NULL,
  content_type        TEXT NOT NULL DEFAULT 'application/json',
  payload_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_sha256      TEXT NOT NULL,
  token_hash          TEXT NOT NULL UNIQUE,
  expires_at          TIMESTAMPTZ NOT NULL,
  revoked_at          TIMESTAMPTZ,
  download_count      INT NOT NULL DEFAULT 0,
  last_downloaded_at  TIMESTAMPTZ,
  meta_json           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS export_artifacts_ws_created_idx
  ON export_artifacts (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS export_artifacts_job_idx
  ON export_artifacts (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS export_artifacts_token_hash_idx
  ON export_artifacts (token_hash);

COMMENT ON TABLE export_artifacts IS
  'Wave 3.3 — tokenized download of attested export packs (schema/SQL/dbt files only; no warehouse rows)';
