-- Small key/value store for Meko account-level ids (e.g. the control
-- conversation that live Meko requires for datapack_create/datapack_delete).
CREATE TABLE meko_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
