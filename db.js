const { DatabaseSync } = require("node:sqlite");
const path = require("path");

// One file, persisted on disk. Point DB_PATH at your host's persistent
// volume/disk in production so this survives redeploys.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "patinir.db");
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_lower TEXT NOT NULL UNIQUE,
  handle TEXT NOT NULL UNIQUE,
  bio TEXT DEFAULT '',
  password_hash TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'personal',
  museum_slug TEXT DEFAULT NULL,
  profile_public INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
`);
// Defensive column adds for databases created before museum accounts existed —
// SQLite throws if the column is already there, which we just ignore.
for (const stmt of [
  "ALTER TABLE users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'personal'",
  "ALTER TABLE users ADD COLUMN museum_slug TEXT DEFAULT NULL",
  "ALTER TABLE users ADD COLUMN profile_public INTEGER NOT NULL DEFAULT 0",
]) {
  try { db.exec(stmt); } catch (e) { /* column already exists */ }
}

db.exec(`
CREATE TABLE IF NOT EXISTS user_data (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  gallery_json TEXT NOT NULL DEFAULT '[]',
  canon_json TEXT NOT NULL DEFAULT '[]',
  visits_json TEXT NOT NULL DEFAULT '[]',
  ui_theme TEXT DEFAULT 'patinir',
  gallery_wall TEXT DEFAULT 'plain',
  curator_note_json TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS feed (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'visit',
  museum TEXT,
  exhibit TEXT,
  rating INTEGER,
  note TEXT,
  date TEXT,
  title TEXT,
  artist TEXT,
  medium TEXT,
  subject TEXT,
  image_data_url TEXT,
  report_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS community_museums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  added_by TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS published_canons (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  handle TEXT NOT NULL,
  name TEXT NOT NULL,
  bio TEXT DEFAULT '',
  items_json TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_slug ON notes(slug);

CREATE TABLE IF NOT EXISTS museum_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  museum_slug TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_slug ON museum_posts(museum_slug);

CREATE TABLE IF NOT EXISTS museum_picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  museum_slug TEXT NOT NULL,
  work TEXT NOT NULL,
  artist TEXT,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_picks_slug ON museum_picks(museum_slug);

CREATE TABLE IF NOT EXISTS follows (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  museum_slug TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, museum_slug)
);
`);

// Same defensive pattern for feed columns added after visit-only sharing existed.
for (const stmt of [
  "ALTER TABLE feed ADD COLUMN kind TEXT NOT NULL DEFAULT 'visit'",
  "ALTER TABLE feed ADD COLUMN title TEXT",
  "ALTER TABLE feed ADD COLUMN artist TEXT",
  "ALTER TABLE feed ADD COLUMN medium TEXT",
  "ALTER TABLE feed ADD COLUMN subject TEXT",
  "ALTER TABLE feed ADD COLUMN image_data_url TEXT",
]) {
  try { db.exec(stmt); } catch (e) { /* column already exists */ }
}

module.exports = db;
