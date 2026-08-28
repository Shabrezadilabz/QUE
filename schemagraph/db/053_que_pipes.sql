-- Que Pipes — NL → pipeline proposals (HITL before job create)

CREATE TABLE IF NOT EXISTS que_pipe_proposals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  prompt          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  spec_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  job_id          UUID REFERENCES jobs(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS que_pipe_proposals_ws_status_idx
  ON que_pipe_proposals (workspace_id, status, updated_at DESC);
