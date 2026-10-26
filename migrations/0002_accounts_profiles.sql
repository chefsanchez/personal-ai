-- Application accounts are independent of the legacy, unused users table.
-- Cloudflare Access owns login identities and invitation policy.
CREATE TABLE IF NOT EXISTS app_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  profile_consent INTEGER NOT NULL DEFAULT 0 CHECK (profile_consent IN (0, 1)),
  consent_updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS derived_profiles (
  session_id TEXT PRIMARY KEY,
  content TEXT NOT NULL CHECK (length(content) <= 8000),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  summary_date TEXT NOT NULL,
  content TEXT NOT NULL CHECK (length(content) <= 8000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (session_id, summary_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_session_date
  ON daily_summaries(session_id, summary_date);
