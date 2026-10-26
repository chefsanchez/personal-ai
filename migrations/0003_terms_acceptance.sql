-- Migration 0002 is already deployed. Add versioned, per-account acceptance.
ALTER TABLE app_accounts ADD COLUMN terms_version TEXT;
ALTER TABLE app_accounts ADD COLUMN terms_accepted_at TEXT;
