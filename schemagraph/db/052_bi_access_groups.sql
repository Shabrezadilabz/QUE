-- Phase P3.6 — BI Studio access groups (field-level + table scope)

CREATE TABLE IF NOT EXISTS bi_access_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  allowed_tables  JSONB NOT NULL DEFAULT '[]'::jsonb,
  denied_columns  JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_filters     JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS bi_access_group_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  group_id        UUID NOT NULL REFERENCES bi_access_groups(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS bi_access_groups_ws_idx
  ON bi_access_groups (workspace_id, enabled);

CREATE INDEX IF NOT EXISTS bi_access_group_members_user_idx
  ON bi_access_group_members (workspace_id, user_id);
