-- Que SaaS Wave 2.5 — scheduled schema sync (introspect only, not ETL)

ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS sync_schedule TEXT NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS sync_next_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_scheduled_sync_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'connections_sync_schedule_chk'
  ) THEN
    ALTER TABLE connections
      ADD CONSTRAINT connections_sync_schedule_chk
      CHECK (sync_schedule IN ('off', 'hourly', 'daily'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS connections_sync_due_idx
  ON connections (sync_next_at)
  WHERE sync_schedule <> 'off' AND sync_next_at IS NOT NULL;

COMMENT ON COLUMN connections.sync_schedule IS
  'Wave 2.5 — off | hourly | daily schema introspect (not full ETL)';
COMMENT ON COLUMN connections.sync_next_at IS
  'Next eligible scheduled introspect time';
COMMENT ON COLUMN connections.last_scheduled_sync_at IS
  'When the scheduler last ran this connection';
