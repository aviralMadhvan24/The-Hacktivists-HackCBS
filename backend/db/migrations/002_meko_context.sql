-- Meko contextual memory: datapack bindings and an authoritative index of every
-- memory LiquidityOS writes. Authorization is decided from this index, never
-- from Meko alone (a Meko API key can read every datapack in its account, and
-- memory_search is not filtered by agent_id).

-- One Meko datapack per family (shared context) and one per user (private context).
CREATE TABLE meko_bindings (
  scope_type       TEXT NOT NULL CHECK (scope_type IN ('family','user')),
  scope_id         UUID NOT NULL,
  datapack_id      TEXT NOT NULL,
  datapack_name    TEXT NOT NULL,
  conversation_id  TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_type, scope_id)
);

CREATE TABLE context_memories (
  id              UUID PRIMARY KEY,
  family_id       UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  owner_user_id   UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = shared with the family
  created_by      UUID NOT NULL REFERENCES users(id),
  kind            TEXT NOT NULL CHECK (kind IN ('goal','preference','decision','investment_reasoning','stress_summary','company_research','note')),
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,                 -- the approved, sanitised text (canonical)
  sources         JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_type    TEXT,                          -- e.g. 'proposal', 'simulation', 'concall'
  related_id      TEXT,
  meko_datapack   TEXT,
  meko_ids        JSONB NOT NULL DEFAULT '[]'::jsonb,
  sync_status     TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending','synced','failed','disabled')),
  sync_error      TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','deleted')),
  superseded_by   UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX context_memories_family_idx ON context_memories (family_id, status, created_at);
CREATE INDEX context_memories_owner_idx ON context_memories (owner_user_id);
