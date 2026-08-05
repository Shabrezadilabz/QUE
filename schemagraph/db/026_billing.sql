-- Que SaaS Wave 4.6 — Stripe seat billing precursor columns

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS seat_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_billing_status_chk'
  ) THEN
    ALTER TABLE workspaces
      ADD CONSTRAINT workspaces_billing_status_chk
      CHECK (billing_status IN ('none', 'trialing', 'active', 'past_due', 'canceled'));
  END IF;
END $$;

COMMENT ON COLUMN workspaces.seat_count IS
  'Wave 4.6 — paid seats from Stripe; soft-enforced against member count';
