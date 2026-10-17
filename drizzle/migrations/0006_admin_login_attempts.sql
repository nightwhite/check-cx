CREATE TABLE IF NOT EXISTS admin_login_attempts (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  window_started_at_ms INTEGER NOT NULL,
  locked_until_ms INTEGER,
  lock_count INTEGER NOT NULL DEFAULT 0,
  updated_at_ms INTEGER NOT NULL
);
