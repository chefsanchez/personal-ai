-- Migration 0005: Custom agent modules in Cloudflare D1
CREATE TABLE IF NOT EXISTS custom_agents (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '🤖',
  role TEXT NOT NULL DEFAULT 'Spezialist',
  system_prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_custom_agents_session_updated
  ON custom_agents(session_id, updated_at);
