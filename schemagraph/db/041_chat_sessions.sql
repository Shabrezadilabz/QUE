-- Chat session metadata (turns remain in ai_chat_turns.session_id)

CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  title         TEXT NOT NULL DEFAULT 'New chat',
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'archived', 'deleted')),
  audience      TEXT NOT NULL DEFAULT 'ceo'
                CHECK (audience IN ('ceo', 'engineer')),
  preview       TEXT,
  message_count INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_chat_sessions_ws_status_idx
  ON ai_chat_sessions (workspace_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS ai_chat_sessions_ws_updated_idx
  ON ai_chat_sessions (workspace_id, updated_at DESC);
