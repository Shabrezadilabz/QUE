-- Workspace settings blob (UI preferences + policy flags)
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS settings_json JSONB NOT NULL DEFAULT '{}'::jsonb;
