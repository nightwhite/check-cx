CREATE TABLE IF NOT EXISTS site_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  site_name TEXT NOT NULL DEFAULT 'Check CX',
  status_title TEXT NOT NULL DEFAULT 'AI Model Status',
  description TEXT,
  logo_url TEXT,
  public_origin TEXT,
  default_check_interval_seconds INTEGER NOT NULL DEFAULT 60,
  notification_cooldown_seconds INTEGER NOT NULL DEFAULT 300,
  created_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  CHECK (id = 'default'),
  CHECK (default_check_interval_seconds BETWEEN 15 AND 3600),
  CHECK (notification_cooldown_seconds BETWEEN 60 AND 86400)
);

INSERT OR IGNORE INTO site_settings (id, site_name, status_title)
VALUES ('default', 'Check CX', 'AI Model Status');

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  website_url TEXT,
  status_page_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

INSERT OR IGNORE INTO channels (
  id,
  name,
  website_url,
  sort_order,
  created_at_ms,
  updated_at_ms
)
SELECT id, group_name, website_url, 0, created_at_ms, updated_at_ms
FROM group_info;

ALTER TABLE check_configs ADD COLUMN channel_id TEXT REFERENCES channels(id) ON DELETE SET NULL;
ALTER TABLE check_configs ADD COLUMN check_interval_seconds INTEGER CHECK (check_interval_seconds IS NULL OR check_interval_seconds BETWEEN 15 AND 3600);
ALTER TABLE check_configs ADD COLUMN last_checked_at_ms INTEGER;
ALTER TABLE check_configs ADD COLUMN region TEXT;

UPDATE check_configs
SET channel_id = (
  SELECT channels.id FROM channels WHERE channels.name = check_configs.group_name
)
WHERE group_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_check_configs_channel_id ON check_configs(channel_id);
CREATE INDEX IF NOT EXISTS idx_check_configs_due ON check_configs(enabled, last_checked_at_ms);

CREATE TABLE IF NOT EXISTS notification_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  lark_webhook_ciphertext TEXT,
  lark_webhook_nonce TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  notify_degraded INTEGER NOT NULL DEFAULT 1 CHECK (notify_degraded IN (0, 1)),
  notify_failed INTEGER NOT NULL DEFAULT 1 CHECK (notify_failed IN (0, 1)),
  notify_recovered INTEGER NOT NULL DEFAULT 1 CHECK (notify_recovered IN (0, 1)),
  created_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  CHECK (id = 'default')
);

INSERT OR IGNORE INTO notification_settings (id) VALUES ('default');

CREATE TABLE IF NOT EXISTS notification_events (
  id TEXT PRIMARY KEY,
  config_id TEXT NOT NULL REFERENCES check_configs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('degraded', 'failed', 'recovered')),
  status TEXT NOT NULL CHECK (status IN ('operational', 'degraded', 'failed', 'validation_failed', 'maintenance', 'error')),
  sent_at_ms INTEGER NOT NULL,
  message TEXT,
  created_at_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_notification_events_config_type_sent
ON notification_events(config_id, event_type, sent_at_ms);
