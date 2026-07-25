-- =============================================================================
-- Stitch metadata DB — Step 1 (spine only)
-- Run in DBeaver against database: stitch
-- Does NOT touch the React app. Safe to re-run after DROP (dev only).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member'
               CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Connections (left sidebar data sources)
-- Secrets stay out of this table for now — placeholder path only.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  -- Aligns with FE DataSourceType (postgresql, mongodb, excel, databricks, …)
  source_type   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'warning', 'error')),
  description   TEXT,
  -- Non-secret config (host, database name, file path ref, etc.)
  config_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_connections_workspace
  ON connections (workspace_id);

-- ---------------------------------------------------------------------------
-- Schema truth (tables / columns) — NOT diagram positions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS schema_objects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES connections (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  entity_kind   TEXT NOT NULL DEFAULT 'TABLE'
                CHECK (entity_kind IN ('TABLE', 'COLLECTION', 'VIEW')),
  source_label  TEXT NOT NULL DEFAULT '',
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, name)
);

CREATE INDEX IF NOT EXISTS idx_schema_objects_workspace
  ON schema_objects (workspace_id);

CREATE TABLE IF NOT EXISTS schema_columns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  schema_object_id UUID NOT NULL REFERENCES schema_objects (id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  data_type        TEXT NOT NULL,
  key_kind         TEXT NOT NULL DEFAULT 'none'
                   CHECK (key_kind IN ('pk', 'fk', 'unique', 'index', 'none')),
  is_nullable      BOOLEAN NOT NULL DEFAULT true,
  description      TEXT,
  -- Optional capped samples (e.g. max 5) — never full tables
  sample_values    JSONB NOT NULL DEFAULT '[]'::jsonb,
  references_label TEXT,
  ordinal          INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schema_object_id, name)
);

CREATE INDEX IF NOT EXISTS idx_schema_columns_object
  ON schema_columns (schema_object_id);

-- ---------------------------------------------------------------------------
-- Stitch Relations (unique wedge: reviewable cross-source joins)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS relationships (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  from_object_id    UUID NOT NULL REFERENCES schema_objects (id) ON DELETE CASCADE,
  from_column_id    UUID NOT NULL REFERENCES schema_columns (id) ON DELETE CASCADE,
  to_object_id      UUID NOT NULL REFERENCES schema_objects (id) ON DELETE CASCADE,
  to_column_id      UUID NOT NULL REFERENCES schema_columns (id) ON DELETE CASCADE,
  -- FE: explicit | ai-inferred
  relation_type     TEXT NOT NULL DEFAULT 'explicit'
                    CHECK (relation_type IN ('explicit', 'ai-inferred')),
  -- Review workflow
  status            TEXT NOT NULL DEFAULT 'accepted'
                    CHECK (status IN ('suggested', 'accepted', 'rejected')),
  confidence        REAL NOT NULL DEFAULT 1.0
                    CHECK (confidence >= 0 AND confidence <= 1),
  join_criteria     TEXT,
  label             TEXT,
  ai_notes          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_relationships_workspace
  ON relationships (workspace_id);

-- ---------------------------------------------------------------------------
-- Stitch layout (UX only — separate from schema truth)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS diagram_layouts (
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  -- map of schema_object_id -> { x, y }
  positions    JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id)
);

-- ---------------------------------------------------------------------------
-- Schema snapshot (for later AI — empty for now, table ready)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS schema_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  label        TEXT,
  graph_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schema_snapshots_workspace
  ON schema_snapshots (workspace_id);

-- ---------------------------------------------------------------------------
-- Dev seed (one workspace + one user) — optional, for DBeaver smoke test
-- ---------------------------------------------------------------------------

INSERT INTO users (id, email, display_name)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'dev@stitch.local',
  'Dev User'
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO workspaces (id, name, slug)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'Demo Workspace',
  'demo'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO workspace_members (workspace_id, user_id, role)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'owner'
)
ON CONFLICT DO NOTHING;
