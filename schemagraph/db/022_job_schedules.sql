-- Que SaaS Wave 4.2 — job schedules, retries, run history metadata

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS run_schedule TEXT NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS run_next_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_scheduled_run_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS run_mode TEXT NOT NULL DEFAULT 'dry_run',
  ADD COLUMN IF NOT EXISTS max_retries INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS retry_delay_sec INT NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS execution_target TEXT NOT NULL DEFAULT 'que';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_run_schedule_chk'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_run_schedule_chk
      CHECK (run_schedule IN ('off', 'hourly', 'daily'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_run_mode_chk'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_run_mode_chk
      CHECK (run_mode IN ('dry_run', 'live'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_execution_target_chk'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_execution_target_chk
      CHECK (execution_target IN ('que', 'private_runner'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS jobs_run_due_idx
  ON jobs (run_next_at)
  WHERE run_schedule <> 'off' AND run_next_at IS NOT NULL;

ALTER TABLE job_runs
  ADD COLUMN IF NOT EXISTS trigger TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS attempt INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_run_id UUID REFERENCES job_runs (id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_runs_trigger_chk'
  ) THEN
    ALTER TABLE job_runs
      ADD CONSTRAINT job_runs_trigger_chk
      CHECK (trigger IN ('manual', 'schedule', 'retry', 'webhook'));
  END IF;
END $$;

COMMENT ON COLUMN jobs.run_schedule IS
  'Wave 4.2 — off | hourly | daily job notebook run (not Airflow)';
COMMENT ON COLUMN job_runs.trigger IS
  'manual | schedule | retry | webhook';
