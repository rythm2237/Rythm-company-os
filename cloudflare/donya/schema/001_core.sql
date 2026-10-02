CREATE TABLE IF NOT EXISTS nail_2nya_admin_users (
  auth_user_id TEXT PRIMARY KEY,
  display_name TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS nail_2nya_services (
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

CREATE TABLE IF NOT EXISTS nail_2nya_customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  instagram_username TEXT,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS nail_2nya_appointments (
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

CREATE TABLE IF NOT EXISTS nail_2nya_booking_tokens (
  appointment_id TEXT PRIMARY KEY REFERENCES nail_2nya_appointments(id) ON DELETE CASCADE,
  token_hash BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT
);

