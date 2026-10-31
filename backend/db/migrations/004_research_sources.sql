-- Saved company investor-relations pages, checked for new concall transcripts.
CREATE TABLE research_sources (
  id            UUID PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticker        TEXT NOT NULL,
  company       TEXT NOT NULL,
  ir_url        TEXT NOT NULL,
  last_checked  TIMESTAMPTZ,
  last_result   JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX research_sources_uq ON research_sources (user_id, ticker, ir_url);
