-- Migration 0004: User projects and tasks in Cloudflare D1
CREATE TABLE IF NOT EXISTS user_projects (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  title TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#9cbaff',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_projects_session_updated
  ON user_projects(session_id, updated_at);

CREATE TABLE IF NOT EXISTS user_tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  project_id TEXT,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES user_projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_tasks_session_done
  ON user_tasks(session_id, done, updated_at);
