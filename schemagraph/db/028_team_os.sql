-- Phase 2 — Team Workflow OS: domains, job templates
CREATE TABLE IF NOT EXISTS workspace_domains (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  connection_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  table_globs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_workspace_domains_ws
  ON workspace_domains (workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS job_templates (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'custom',
  notebook_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_tables JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_job_templates_ws
  ON job_templates (workspace_id, updated_at DESC);

-- Digest cursor for drift digests
CREATE TABLE IF NOT EXISTS workspace_digest_state (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  last_drift_digest_at TIMESTAMPTZ,
  last_join_digest_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
