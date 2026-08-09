-- Close Cursor-loop gaps: org rules, join comments, transform drafts,
-- metric definitions, proposal diffs, contract tests registry

CREATE TABLE IF NOT EXISTS workspace_rules (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'general',
  -- join | naming | privacy | sql | transform | general
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  source TEXT NOT NULL DEFAULT 'manual',
  -- manual | promote | agent | import
  priority INT NOT NULL DEFAULT 100,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_rules_ws
  ON workspace_rules (workspace_id, enabled, priority);

COMMENT ON TABLE workspace_rules IS
  'Cursor-like always-on org rules injected into AI + join/transform flows';

CREATE TABLE IF NOT EXISTS join_review_comments (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  relationship_id UUID NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_join_comments_rel
  ON join_review_comments (workspace_id, relationship_id, created_at);

CREATE TABLE IF NOT EXISTS transform_drafts (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  sql_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'proposed',
  -- proposed | approved | rejected | applied
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transform_drafts_ws
  ON transform_drafts (workspace_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS metric_definitions (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  expression_sql TEXT NOT NULL DEFAULT '',
  dataset_id UUID REFERENCES managed_datasets(id) ON DELETE SET NULL,
  dimensions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  certified BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_metric_defs_ws
  ON metric_definitions (workspace_id, certified, updated_at DESC);

CREATE TABLE IF NOT EXISTS proposal_diffs (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  -- join | sql | job | transform | metric
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  before_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open',
  -- open | approved | rejected
  resource_type TEXT,
  resource_id UUID,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_diffs_ws
  ON proposal_diffs (workspace_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS contract_test_runs (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'passed',
  summary TEXT NOT NULL DEFAULT '',
  results_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_test_runs_ws
  ON contract_test_runs (workspace_id, created_at DESC);

COMMENT ON TABLE metric_definitions IS
  'Semantic metrics bound to certified managed datasets — DA self-serve layer';
COMMENT ON TABLE proposal_diffs IS
  'PR-like approve/diff queue for joins, SQL, jobs, transforms';
