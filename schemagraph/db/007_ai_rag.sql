-- Que AI RAG layer: pgvector chunks + feedback + limited-memory turns
-- Requires image: pgvector/pgvector:pg16 (stock postgres:16 lacks vector)

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS ai_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  source_kind   TEXT NOT NULL CHECK (source_kind IN (
                  'schema_table', 'schema_column', 'relationship', 'doc'
                )),
  source_ref    TEXT NOT NULL,
  title         TEXT NOT NULL DEFAULT '',
  content       TEXT NOT NULL,
  embedding     vector(1536) NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (workspace_id, source_ref)
);

CREATE INDEX IF NOT EXISTS ai_chunks_workspace_idx
  ON ai_chunks (workspace_id);

CREATE INDEX IF NOT EXISTS ai_chunks_kind_idx
  ON ai_chunks (source_kind);

-- Cosine distance search (HNSW)
CREATE INDEX IF NOT EXISTS ai_chunks_embedding_hnsw
  ON ai_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS ai_chat_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  message_id      TEXT,
  message_hash    TEXT NOT NULL,
  rating          SMALLINT NOT NULL CHECK (rating IN (-1, 1)),
  note            TEXT,
  model_id        TEXT,
  source_refs     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_chat_feedback_ws_idx
  ON ai_chat_feedback (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_chat_turns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id    TEXT NOT NULL DEFAULT 'default',
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content       TEXT NOT NULL,
  model_id      TEXT,
  mode          TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_chat_turns_ws_session_idx
  ON ai_chat_turns (workspace_id, session_id, created_at DESC);
