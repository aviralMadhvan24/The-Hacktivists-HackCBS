-- Simulated (demo) Zerodha connections, clearly separated from real ones.
-- A simulated connection never talks to Kite; its portfolio is stored here.
-- IF NOT EXISTS: YugabyteDB DDL is not rolled back with the transaction, so a failed run can leave the columns behind.
ALTER TABLE broker_connections ADD COLUMN IF NOT EXISTS simulated BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE broker_connections ADD COLUMN IF NOT EXISTS simulated_portfolio JSONB;
