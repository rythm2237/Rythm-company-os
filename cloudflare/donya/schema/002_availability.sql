CREATE TABLE IF NOT EXISTS nail_2nya_business_hours (
  id TEXT PRIMARY KEY,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS nail_2nya_business_profile (
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

CREATE TABLE IF NOT EXISTS nail_2nya_availability_exceptions (
  id TEXT PRIMARY KEY,
  exception_date TEXT NOT NULL UNIQUE,
  is_closed INTEGER NOT NULL DEFAULT 0 CHECK (is_closed IN (0,1)),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS nail_2nya_special_availability (
  id TEXT PRIMARY KEY,
  availability_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS nail_2nya_blocked_periods (
  id TEXT PRIMARY KEY,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by TEXT REFERENCES nail_2nya_admin_users(auth_user_id) ON DELETE SET NULL,
  CHECK (end_at > start_at)
);

