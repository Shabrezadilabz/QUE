-- Que SaaS Wave 4.3 — Airflow/Dagster orchestrator webhook (trigger only)

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS orchestrator_webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS orchestrator_webhook_secret TEXT,
  ADD COLUMN IF NOT EXISTS orchestrator_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS orchestrator_kind TEXT NOT NULL DEFAULT 'generic';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_orchestrator_kind_chk'
  ) THEN
    ALTER TABLE workspaces
      ADD CONSTRAINT workspaces_orchestrator_kind_chk
      CHECK (orchestrator_kind IN ('generic', 'airflow', 'dagster'));
  END IF;
END $$;

COMMENT ON COLUMN workspaces.orchestrator_webhook_url IS
  'Wave 4.3 — external orchestrator trigger URL (HMAC POST; not an Airflow clone)';
