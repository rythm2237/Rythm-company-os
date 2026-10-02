PRAGMA foreign_keys = ON;

CREATE TABLE nail_2nya_admin_users (
  auth_user_id TEXT PRIMARY KEY,
  display_name TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE nail_2nya_services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 15 AND 720),
  buffer_before INTEGER NOT NULL DEFAULT 0 CHECK (buffer_before BETWEEN 0 AND 180),
  buffer_after INTEGER NOT NULL DEFAULT 0 CHECK (buffer_after BETWEEN 0 AND 180),
  price NUMERIC,
  deposit_amount NUMERIC,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  booking_available INTEGER NOT NULL DEFAULT 1 CHECK (booking_available IN (0,1)),
  image_path TEXT,
  preparation_note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE nail_2nya_customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  instagram_username TEXT,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE nail_2nya_appointments (
  id TEXT PRIMARY KEY,
  booking_reference TEXT NOT NULL UNIQUE,
  service_id TEXT NOT NULL REFERENCES nail_2nya_services(id),
  customer_id TEXT NOT NULL REFERENCES nail_2nya_customers(id),
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  reserved_start_at TEXT NOT NULL,
  reserved_end_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending','confirmed','completed','cancelled','no_show')),
  customer_notes TEXT,
  admin_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT REFERENCES nail_2nya_admin_users(auth_user_id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'customer' CHECK (source IN ('customer','admin')),
  CHECK (end_at > start_at),
  CHECK (reserved_end_at > reserved_start_at)
);

CREATE TABLE nail_2nya_booking_tokens (
  appointment_id TEXT PRIMARY KEY REFERENCES nail_2nya_appointments(id) ON DELETE CASCADE,
  token_hash BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT
);

CREATE TABLE nail_2nya_business_hours (
  id TEXT PRIMARY KEY,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (end_time > start_time)
);

CREATE TABLE nail_2nya_business_profile (
  id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL DEFAULT '2nya Nail Art',
  instagram_url TEXT NOT NULL DEFAULT 'https://www.instagram.com/2nya._nailart/',
  phone TEXT,
  address TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  currency TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  slot_interval_minutes INTEGER NOT NULL DEFAULT 15 CHECK (slot_interval_minutes BETWEEN 5 AND 120),
  min_booking_notice_minutes INTEGER NOT NULL DEFAULT 0 CHECK (min_booking_notice_minutes >= 0),
  max_advance_days INTEGER NOT NULL DEFAULT 180 CHECK (max_advance_days BETWEEN 1 AND 730),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE nail_2nya_availability_exceptions (
  id TEXT PRIMARY KEY,
  exception_date TEXT NOT NULL UNIQUE,
  is_closed INTEGER NOT NULL DEFAULT 0 CHECK (is_closed IN (0,1)),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE nail_2nya_special_availability (
  id TEXT PRIMARY KEY,
  availability_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (end_time > start_time)
);

CREATE TABLE nail_2nya_blocked_periods (
  id TEXT PRIMARY KEY,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT REFERENCES nail_2nya_admin_users(auth_user_id) ON DELETE SET NULL,
  CHECK (end_at > start_at)
);

CREATE TABLE nail_2nya_portfolio_items (
  id TEXT PRIMARY KEY,
  image_path TEXT NOT NULL,
  alt_text TEXT,
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE nail_2nya_site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (json_valid(value))
);

CREATE TABLE nail_2nya_contact_messages (
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

CREATE TABLE nail_2nya_customer_push_subscriptions (
  id TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL REFERENCES nail_2nya_appointments(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE nail_2nya_notification_deliveries (
  id TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL REFERENCES nail_2nya_appointments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  target TEXT NOT NULL CHECK (target IN ('admin','customer')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (appointment_id,event_type,target)
);

CREATE TABLE nail_2nya_push_deliveries (
  appointment_id TEXT PRIMARY KEY REFERENCES nail_2nya_appointments(id) ON DELETE CASCADE,
  notified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE nail_2nya_push_keys (
  singleton INTEGER PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE nail_2nya_push_subscriptions (
  id TEXT PRIMARY KEY,
  auth_user_id TEXT NOT NULL REFERENCES nail_2nya_admin_users(auth_user_id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE nail_2nya_realtime_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id TEXT,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE nail_2nya_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_table TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  changed_by TEXT,
  old_data TEXT CHECK (old_data IS NULL OR json_valid(old_data)),
  new_data TEXT CHECK (new_data IS NULL OR json_valid(new_data)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE nail_2nya_public_media_chunks_v4 (
  asset_key TEXT NOT NULL,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  base64_data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (asset_key,chunk_index)
);

CREATE INDEX nail_2nya_appt_customer_idx ON nail_2nya_appointments(customer_id);
CREATE INDEX nail_2nya_appt_service_idx ON nail_2nya_appointments(service_id);
CREATE INDEX nail_2nya_appt_start_idx ON nail_2nya_appointments(start_at);
CREATE INDEX nail_2nya_appt_status_idx ON nail_2nya_appointments(status,start_at);
CREATE INDEX nail_2nya_appt_created_by_idx ON nail_2nya_appointments(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX nail_2nya_appt_overlap_idx ON nail_2nya_appointments(status,reserved_start_at,reserved_end_at);
CREATE INDEX nail_2nya_block_created_by_idx ON nail_2nya_blocked_periods(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX nail_2nya_block_range_idx ON nail_2nya_blocked_periods(start_at,end_at);
CREATE INDEX nail_2nya_hours_weekday_idx ON nail_2nya_business_hours(weekday) WHERE active = 1;
CREATE INDEX nail_2nya_customer_push_appointment_idx ON nail_2nya_customer_push_subscriptions(appointment_id) WHERE active = 1;
CREATE INDEX nail_2nya_special_date_idx ON nail_2nya_special_availability(availability_date);

-- Appointment overlap protection is enforced in Worker service logic during the backend migration phase.
-- PostgreSQL used a GiST exclusion constraint. D1 does not provide an equivalent native range constraint.
END;
