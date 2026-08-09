-- P2: marketplace installs, metric lineage, threaded comments, presence

ALTER TABLE join_review_comments
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES join_review_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_join_comments_parent
  ON join_review_comments (workspace_id, relationship_id, parent_id);

ALTER TABLE metric_definitions
  ADD COLUMN IF NOT EXISTS source_object_id UUID,
  ADD COLUMN IF NOT EXISTS source_column_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS lineage_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tags_json JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN metric_definitions.lineage_json IS
  'Lineage-to-metric edges: tables, columns, jobs, datasets';

CREATE TABLE IF NOT EXISTS industry_pack_installs (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  pack_id TEXT NOT NULL,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  installed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pack_installs_ws
  ON industry_pack_installs (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workspace_presence (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  page_path TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_presence_seen
  ON workspace_presence (workspace_id, last_seen_at DESC);

COMMENT ON TABLE workspace_presence IS
  'HTTP heartbeat presence for multiplayer (no WebSocket required)';
COMMENT ON TABLE industry_pack_installs IS
  'Marketplace pack apply history per workspace';
