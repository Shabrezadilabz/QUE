-- Que P0.1 — join inference as first-class product
-- HITL review audit trail for promote/reject (feeds org memory + diligence)

CREATE TABLE IF NOT EXISTS relationship_review_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  relationship_id   UUID NOT NULL REFERENCES relationships (id) ON DELETE CASCADE,
  action            TEXT NOT NULL CHECK (action IN ('promote', 'reject')),
  actor_user_id     UUID REFERENCES users (id) ON DELETE SET NULL,
  previous_status   TEXT,
  previous_type     TEXT,
  previous_confidence REAL,
  evidence_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS relationship_review_events_ws_created_idx
  ON relationship_review_events (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS relationship_review_events_rel_idx
  ON relationship_review_events (relationship_id, created_at DESC);

COMMENT ON TABLE relationship_review_events IS
  'HITL promote/reject audit — org memory signal for join inference scoring';
