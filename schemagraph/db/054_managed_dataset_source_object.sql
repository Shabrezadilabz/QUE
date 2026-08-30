-- Chat / CEO guard: managed marts must be joinable to schema_objects.
-- Code already SELECTs managed_datasets.source_object_id (ceoChatGuard);
-- 032 created the table without this column.

ALTER TABLE managed_datasets
  ADD COLUMN IF NOT EXISTS source_object_id UUID REFERENCES schema_objects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_managed_datasets_source_obj
  ON managed_datasets (workspace_id, source_object_id)
  WHERE source_object_id IS NOT NULL;

-- Safety: 037 columns if that file was recorded but not fully applied
ALTER TABLE metric_definitions
  ADD COLUMN IF NOT EXISTS source_object_id UUID,
  ADD COLUMN IF NOT EXISTS source_column_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS lineage_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tags_json JSONB NOT NULL DEFAULT '[]'::jsonb;
