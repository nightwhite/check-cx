PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS check_request_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('openai', 'gemini', 'anthropic')),
  request_header_json TEXT,
  metadata_json TEXT,
  created_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS check_models (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('openai', 'gemini', 'anthropic')),
  model TEXT NOT NULL,
  template_id TEXT REFERENCES check_request_templates(id) ON DELETE SET NULL,
  created_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS check_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('openai', 'gemini', 'anthropic')),
  model_id TEXT NOT NULL REFERENCES check_models(id) ON DELETE RESTRICT,
  endpoint TEXT NOT NULL,
  api_key_ciphertext TEXT,
  api_key_nonce TEXT,
  api_key_version INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  is_maintenance INTEGER NOT NULL DEFAULT 0 CHECK (is_maintenance IN (0, 1)),
  group_name TEXT,
  created_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS check_history (
  id TEXT PRIMARY KEY,
  config_id TEXT NOT NULL REFERENCES check_configs(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('operational', 'degraded', 'failed', 'validation_failed', 'maintenance', 'error')),
  latency_ms INTEGER,
  ping_latency_ms INTEGER,
  checked_at_ms INTEGER NOT NULL,
  message TEXT,
  log_message TEXT,
  official_status_json TEXT
);

CREATE TABLE IF NOT EXISTS check_latest (
  config_id TEXT PRIMARY KEY REFERENCES check_configs(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('operational', 'degraded', 'failed', 'validation_failed', 'maintenance', 'error')),
  latency_ms INTEGER,
  ping_latency_ms INTEGER,
  checked_at_ms INTEGER NOT NULL,
  message TEXT,
  log_message TEXT,
  official_status_json TEXT,
  updated_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS availability_rollups (
  config_id TEXT NOT NULL REFERENCES check_configs(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('7d', '15d', '30d')),
  day_start_ms INTEGER NOT NULL,
  total_checks INTEGER NOT NULL DEFAULT 0,
  operational_count INTEGER NOT NULL DEFAULT 0,
  updated_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (config_id, period, day_start_ms)
);

CREATE TABLE IF NOT EXISTS dashboard_snapshots (
  snapshot_key TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('7d', '15d', '30d')),
  payload_json TEXT NOT NULL,
  etag TEXT NOT NULL,
  generated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (snapshot_key, period)
);

CREATE TABLE IF NOT EXISTS group_info (
  id TEXT PRIMARY KEY,
  group_name TEXT NOT NULL UNIQUE,
  website_url TEXT,
  tags TEXT,
  created_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS system_notifications (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warning', 'error')),
  created_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS official_status_snapshots (
  provider TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('operational', 'degraded', 'down', 'unknown')),
  message TEXT NOT NULL,
  affected_components_json TEXT,
  checked_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS job_locks (
  job_name TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  locked_until_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS job_runs (
  id TEXT PRIMARY KEY,
  job_name TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'skipped')),
  started_at_ms INTEGER NOT NULL,
  finished_at_ms INTEGER,
  checked_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_check_history_config_checked_at ON check_history(config_id, checked_at_ms);
CREATE INDEX IF NOT EXISTS idx_check_history_checked_at ON check_history(checked_at_ms);
CREATE INDEX IF NOT EXISTS idx_check_configs_group_name ON check_configs(group_name);
CREATE INDEX IF NOT EXISTS idx_dashboard_snapshots_key_period ON dashboard_snapshots(snapshot_key, period);
CREATE INDEX IF NOT EXISTS idx_job_locks_locked_until ON job_locks(locked_until_ms);
CREATE INDEX IF NOT EXISTS idx_job_runs_started_at ON job_runs(started_at_ms);
