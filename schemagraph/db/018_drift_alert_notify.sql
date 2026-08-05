-- Wave 2.3 — drift alert delivery tracking
ALTER TABLE workspace_drift_events
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notify_status TEXT;

COMMENT ON COLUMN workspace_drift_events.notified_at IS
  'Wave 2.3 — when Slack/webhook/email alert was attempted';
COMMENT ON COLUMN workspace_drift_events.notify_status IS
  'Wave 2.3 — delivered | skipped | failed + short reason';
