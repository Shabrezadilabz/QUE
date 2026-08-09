-- Offer B quotas/retention + ops heartbeats

ALTER TABLE managed_datasets
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_run_id UUID,
  ADD COLUMN IF NOT EXISTS bytes_estimate BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_managed_datasets_expires
  ON managed_datasets (workspace_id, expires_at)
  WHERE expires_at IS NOT NULL;

COMMENT ON COLUMN managed_datasets.expires_at IS
  'Offer B retention — purge after this timestamp (workspace retention days)';

-- Lightweight ops heartbeats (API process health samples)
CREATE TABLE IF NOT EXISTS ops_heartbeats (
  id UUID PRIMARY KEY,
  service TEXT NOT NULL DEFAULT 'que-api',
  status TEXT NOT NULL DEFAULT 'ok',
  detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_heartbeats_created
  ON ops_heartbeats (created_at DESC);

COMMENT ON TABLE ops_heartbeats IS
  'Ops monitoring samples written by /metrics and health probes';
