-- Stored investment-agent evaluations (inputs, deterministic analysis, optional AI narrative).
CREATE TABLE agent_evaluations (
  id           UUID PRIMARY KEY,
  family_id    UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol       TEXT NOT NULL,
  exchange     TEXT NOT NULL,
  amount       NUMERIC(18,2) NOT NULL,
  result       JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agent_evaluations_lookup_idx ON agent_evaluations (family_id, user_id, created_at);
