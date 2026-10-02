CREATE TABLE IF NOT EXISTS nail_2nya_portfolio_items (
  id TEXT PRIMARY KEY,
  image_path TEXT NOT NULL,
  alt_text TEXT,
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS nail_2nya_site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (json_valid(value))
);

CREATE TABLE IF NOT EXISTS nail_2nya_contact_messages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  phone TEXT,
  subject TEXT NOT NULL DEFAULT 'general' CHECK (length(subject) BETWEEN 1 AND 120),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 2 AND 2000),
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  read_at TEXT,
  archived_at TEXT,
  push_notified_at TEXT
);

CREATE TABLE IF NOT EXISTS nail_2nya_customer_push_subscriptions (
  id TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL REFERENCES nail_2nya_appointments(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS nail_2nya_notification_deliveries (
  id TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL REFERENCES nail_2nya_appointments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  target TEXT NOT NULL CHECK (target IN ('admin','customer')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (appointment_id,event_type,target)
);

CREATE TABLE IF NOT EXISTS nail_2nya_push_deliveries (
  appointment_id TEXT PRIMARY KEY REFERENCES nail_2nya_appointments(id) ON DELETE CASCADE,
  notified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS nail_2nya_push_keys (
  singleton INTEGER PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS nail_2nya_push_subscriptions (
  id TEXT PRIMARY KEY,
  auth_user_id TEXT NOT NULL REFERENCES nail_2nya_admin_users(auth_user_id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS nail_2nya_realtime_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id TEXT,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS nail_2nya_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_table TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  changed_by TEXT,
  old_data TEXT CHECK (old_data IS NULL OR json_valid(old_data)),
  new_data TEXT CHECK (new_data IS NULL OR json_valid(new_data)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS nail_2nya_public_media_chunks_v4 (
  asset_key TEXT NOT NULL,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  base64_data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (asset_key,chunk_index)
);

