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
  created_at INTEGER NOT NULL
);

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
  museum TEXT NOT NULL,
  exhibit TEXT,
  rating INTEGER,
  note TEXT,
  date TEXT,
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
`);

module.exports = db;
