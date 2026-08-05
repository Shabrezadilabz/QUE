-- Que SaaS Wave 1.3 — connector health + re-auth signals
-- Persists last sync outcome so Sources can show Day-2 ops CTAs

ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_error_kind TEXT
    CHECK (
      last_sync_error_kind IS NULL
      OR last_sync_error_kind IN ('auth', 'network', 'config', 'unknown')
    );

COMMENT ON COLUMN connections.last_sync_at IS
  'Wave 1.3 — last successful schema sync timestamp';
COMMENT ON COLUMN connections.last_sync_error IS
  'Wave 1.3 — last failed sync message (cleared on success)';
COMMENT ON COLUMN connections.last_sync_error_kind IS
  'Wave 1.3 — auth | network | config | unknown for re-auth CTA';
