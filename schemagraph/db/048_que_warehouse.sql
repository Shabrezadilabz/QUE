-- Phase 1 — Que Warehouse per workspace (isolated schema + raw replicate registry)

CREATE TABLE IF NOT EXISTS que_warehouse_registry (
  workspace_id    UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  schema_name     TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'provisioning', 'suspended')),
  provisioned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta_json       JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS que_warehouse_tables (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_id       UUID REFERENCES connections(id) ON DELETE SET NULL,
  source_table        TEXT NOT NULL DEFAULT '',
  raw_table_name      TEXT NOT NULL,
  row_count           BIGINT NOT NULL DEFAULT 0,
  last_replicated_at  TIMESTAMPTZ,
  meta_json           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, raw_table_name)
);

CREATE INDEX IF NOT EXISTS que_wh_tables_ws_idx
  ON que_warehouse_tables (workspace_id, connection_id);

ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS replicate_to_warehouse BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS monk_prompt_dismissed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS monk_prompt_last_sync_at TIMESTAMPTZ;
