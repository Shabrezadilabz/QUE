-- Que SaaS Wave 4.5 — private runner callback MVP (not full VPC agent)

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS private_runner_url TEXT,
  ADD COLUMN IF NOT EXISTS private_runner_secret TEXT,
  ADD COLUMN IF NOT EXISTS private_runner_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN workspaces.private_runner_url IS
  'Wave 4.5 — customer-hosted runner work-order URL (HMAC); not a Que VPC agent';
