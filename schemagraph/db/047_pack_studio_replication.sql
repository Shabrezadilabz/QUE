-- Phase 6: Pack Studio (custom packs, column maps, golden pairs, replication pipelines)

CREATE TABLE IF NOT EXISTS custom_pack_definitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  pack_id         TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  industry        TEXT NOT NULL DEFAULT 'Custom',
  description     TEXT NOT NULL DEFAULT '',
  base_pack_ids   JSONB NOT NULL DEFAULT '[]'::jsonb,
  blend_weights   JSONB NOT NULL DEFAULT '{}'::jsonb,
  definition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'active', 'archived')),
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, pack_id)
);

CREATE INDEX IF NOT EXISTS custom_pack_ws_idx
  ON custom_pack_definitions (workspace_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS learned_golden_pairs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  from_table      TEXT NOT NULL,
  from_column     TEXT NOT NULL,
  to_table        TEXT NOT NULL,
  to_column       TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'manual',
  confidence      NUMERIC(6, 4),
  hit_count       INT NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, from_table, from_column, to_table, to_column)
);

CREATE INDEX IF NOT EXISTS learned_golden_ws_idx
  ON learned_golden_pairs (workspace_id, hit_count DESC);

CREATE TABLE IF NOT EXISTS connection_replication_pipelines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_id     UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  target_schema     TEXT NOT NULL DEFAULT 'que_replica',
  table_names       JSONB NOT NULL DEFAULT '[]'::jsonb,
  mode              TEXT NOT NULL DEFAULT 'incremental'
                    CHECK (mode IN ('full', 'incremental')),
  watermark_column  TEXT,
  schedule          TEXT NOT NULL DEFAULT 'daily'
                    CHECK (schedule IN ('off', 'hourly', 'daily')),
  enabled           BOOLEAN NOT NULL DEFAULT true,
  last_run_at       TIMESTAMPTZ,
  last_row_count    BIGINT,
  last_status       TEXT,
  last_error        TEXT,
  meta_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS replication_pipeline_ws_idx
  ON connection_replication_pipelines (workspace_id, enabled, schedule);
