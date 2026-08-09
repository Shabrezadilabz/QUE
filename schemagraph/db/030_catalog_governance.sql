-- Phase 4 — Catalog / governance MVP (optional expansion)

CREATE TABLE IF NOT EXISTS catalog_assets (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'dashboard',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  external_url TEXT,
  tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_assets_ws
  ON catalog_assets (workspace_id, kind, updated_at DESC);

CREATE TABLE IF NOT EXISTS catalog_asset_deps (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES catalog_assets(id) ON DELETE CASCADE,
  schema_object_id UUID REFERENCES schema_objects(id) ON DELETE SET NULL,
  table_name TEXT,
  column_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_asset_deps_ws
  ON catalog_asset_deps (workspace_id, asset_id);

CREATE TABLE IF NOT EXISTS glossary_terms (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  definition TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  synonyms_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_glossary_terms_ws
  ON glossary_terms (workspace_id, status, name);

CREATE TABLE IF NOT EXISTS glossary_term_links (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES glossary_terms(id) ON DELETE CASCADE,
  schema_object_id UUID REFERENCES schema_objects(id) ON DELETE CASCADE,
  schema_column_id UUID REFERENCES schema_columns(id) ON DELETE CASCADE,
  table_name TEXT,
  column_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_glossary_links_term
  ON glossary_term_links (workspace_id, term_id);

CREATE TABLE IF NOT EXISTS stewardship_certifications (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'certified',
  certified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_steward_cert_ws
  ON stewardship_certifications (workspace_id, status, expires_at);

CREATE TABLE IF NOT EXISTS policy_packs (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'pii',
  rules_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_policy_packs_ws
  ON policy_packs (workspace_id, enabled);

CREATE TABLE IF NOT EXISTS governance_tickets (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'webhook',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',
  external_key TEXT,
  external_url TEXT,
  meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gov_tickets_ws
  ON governance_tickets (workspace_id, status, created_at DESC);

COMMENT ON TABLE catalog_assets IS
  'Phase 4 — dashboards/metrics/pipelines as first-class catalog nodes';
COMMENT ON TABLE glossary_terms IS
  'Phase 4 — business glossary terms';
COMMENT ON TABLE stewardship_certifications IS
  'Phase 4 — certify / expire stewardship records';
COMMENT ON TABLE policy_packs IS
  'Phase 4 — PII / retention / access policy packs';
COMMENT ON TABLE governance_tickets IS
  'Phase 4 — Jira/ServiceNow/webhook ticket outbox';
