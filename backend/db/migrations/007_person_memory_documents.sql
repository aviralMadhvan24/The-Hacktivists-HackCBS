-- Person-level Meko memory, family sharing and documents.
-- IF NOT EXISTS throughout: YugabyteDB DDL is not rolled back with a failed transaction.

-- A member who opts in shares their Meko memory and documents with one family's chat.
CREATE TABLE IF NOT EXISTS memory_shares (
  family_id   UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, user_id)
);

-- Documents uploaded to the user's Meko knowledge base. The file itself is not
-- stored by FinSight; only metadata and suggested records extracted from it.
CREATE TABLE IF NOT EXISTS documents (
  id                UUID PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL,
  filename          TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL,
  sha256            TEXT NOT NULL,
  meko_datapack     TEXT,
  meko_key          TEXT,
  meko_document_id  TEXT,
  fingerprint       TEXT,   -- a short text snippet used to find the Meko document id once indexed
  status            TEXT NOT NULL DEFAULT 'uploading',
  status_detail     TEXT,
  consent_at        TIMESTAMPTZ NOT NULL,
  suggestions       JSONB,
  analysis_status   TEXT NOT NULL DEFAULT 'pending',
  analysis_error    TEXT,
  applied_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS documents_user_idx ON documents (user_id, created_at);
