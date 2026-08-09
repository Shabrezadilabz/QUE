-- Production: pinned samples + managed data plane (Offer B) + external job status

-- Fixed scrubbed samples per table (immutable until explicit re-pin)
CREATE TABLE IF NOT EXISTS pinned_table_samples (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  schema_object_id UUID NOT NULL REFERENCES schema_objects(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES connections(id) ON DELETE SET NULL,
  table_name TEXT NOT NULL,
  row_count INT NOT NULL DEFAULT 0,
  columns_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  rows_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  scrubbed BOOLEAN NOT NULL DEFAULT true,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pinned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  source_sync_at TIMESTAMPTZ,
  UNIQUE (workspace_id, schema_object_id)
);

CREATE INDEX IF NOT EXISTS idx_pinned_samples_ws
  ON pinned_table_samples (workspace_id, table_name);

COMMENT ON TABLE pinned_table_samples IS
  'Production — fixed 5–10 scrubbed sample rows per table; not overwritten on sync until re-pin';

-- Offer B: Que managed data plane (job outputs for Excel/SQL customers)
CREATE TABLE IF NOT EXISTS managed_datasets (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  column_schema_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  row_count BIGINT NOT NULL DEFAULT 0,
  certified BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);

CREATE TABLE IF NOT EXISTS managed_dataset_rows (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  dataset_id UUID NOT NULL REFERENCES managed_datasets(id) ON DELETE CASCADE,
  row_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_managed_rows_dataset
  ON managed_dataset_rows (workspace_id, dataset_id);

COMMENT ON TABLE managed_datasets IS
  'Offer B — Que-hosted job output tables; AI must not read row payloads';
COMMENT ON TABLE managed_dataset_rows IS
  'Offer B — row store for managed datasets (workspace-isolated)';

-- External / hosted job run status bridge
ALTER TABLE job_runs
  ADD COLUMN IF NOT EXISTS execution_target TEXT NOT NULL DEFAULT 'que',
  ADD COLUMN IF NOT EXISTS external_ref TEXT,
  ADD COLUMN IF NOT EXISTS external_status TEXT;

CREATE INDEX IF NOT EXISTS idx_job_runs_external
  ON job_runs (workspace_id, execution_target, status);

-- Join edit audit helper column
ALTER TABLE relationships
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edited_by UUID REFERENCES users(id) ON DELETE SET NULL;
