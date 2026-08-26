-- Phase 2: entity mappings + pack certification records

CREATE TABLE IF NOT EXISTS entity_mappings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id          UUID REFERENCES monk_mode_runs(id) ON DELETE SET NULL,
  pack_id         TEXT NOT NULL DEFAULT 'ecommerce-v1',
  entity          TEXT NOT NULL,
  pattern         TEXT NOT NULL,
  table_name      TEXT NOT NULL,
  connection      TEXT,
  column_map      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, pack_id, entity)
);

CREATE INDEX IF NOT EXISTS entity_mappings_ws_idx
  ON entity_mappings (workspace_id, pack_id);

CREATE TABLE IF NOT EXISTS workspace_pack_certifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id            UUID REFERENCES monk_mode_runs(id) ON DELETE SET NULL,
  pack_id           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'passed', 'failed')),
  golden_recall     NUMERIC(6, 4),
  promoted_recall   NUMERIC(6, 4),
  kpi_count         INT NOT NULL DEFAULT 0,
  job_count         INT NOT NULL DEFAULT 0,
  report_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
  certified_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_pack_cert_ws_idx
  ON workspace_pack_certifications (workspace_id, pack_id, created_at DESC);
