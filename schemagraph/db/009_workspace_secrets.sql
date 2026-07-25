-- Workspace BYOK secrets (encrypted at rest; never returned in plaintext via settings API)

CREATE TABLE IF NOT EXISTS workspace_secrets (
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  secret_key    TEXT NOT NULL,
  ciphertext    TEXT NOT NULL,
  hint          TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, secret_key)
);

COMMENT ON TABLE workspace_secrets IS
  'Bring-your-own-key store. Values encrypted with QUE_SECRETS_KEY. Never expose plaintext to clients.';
