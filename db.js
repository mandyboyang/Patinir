const { Pool, types } = require("pg");
// created_at columns are bigint (millisecond timestamps overflow int4). Postgres's
// driver returns bigint as a string by default, to protect values too large for a
// JS number — ours never are, so parse them back to real numbers for consistency
// with how this data looked before the migration.
types.setTypeParser(20, (val) => parseInt(val, 10));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_URL in environment. Set it to your Neon (or other Postgres) connection string.");
  process.exit(1);
}

// Neon (and most managed Postgres) require SSL. rejectUnauthorized:false keeps
// this simple for a small project — fine here, not something to reuse for a
// system handling sensitive data at real scale without revisiting.
const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      name_lower TEXT NOT NULL UNIQUE,
      handle TEXT NOT NULL UNIQUE,
      bio TEXT DEFAULT '',
      password_hash TEXT NOT NULL,
      account_type TEXT NOT NULL DEFAULT 'personal',
      museum_slug TEXT DEFAULT NULL,
      profile_public INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_data (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      gallery_json TEXT NOT NULL DEFAULT '[]',
      canon_json TEXT NOT NULL DEFAULT '[]',
      visits_json TEXT NOT NULL DEFAULT '[]',
      ui_theme TEXT DEFAULT 'patinir',
      gallery_wall TEXT DEFAULT 'plain'
    );

    CREATE TABLE IF NOT EXISTS feed (
      id SERIAL PRIMARY KEY,
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
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS community_museums (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      added_by TEXT,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id SERIAL PRIMARY KEY,
      slug TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_slug ON notes(slug);

    CREATE TABLE IF NOT EXISTS museum_posts (
      id SERIAL PRIMARY KEY,
      museum_slug TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_posts_slug ON museum_posts(museum_slug);

    CREATE TABLE IF NOT EXISTS museum_picks (
      id SERIAL PRIMARY KEY,
      museum_slug TEXT NOT NULL,
      work TEXT NOT NULL,
      artist TEXT,
      note TEXT,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_picks_slug ON museum_picks(museum_slug);

    CREATE TABLE IF NOT EXISTS follows (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      museum_slug TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, museum_slug)
    );
  `);
}

// Small helpers so the rest of the app can stay close to the shape it had
// before (get one row / get many rows / just run something), instead of
// every call site juggling pg's {rows: [...]} shape directly.
async function one(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows[0] || null;
}
async function many(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}
async function run(sql, params = []) {
  const r = await pool.query(sql, params);
  return { changes: r.rowCount, lastInsertRowid: r.rows[0]?.id };
}

module.exports = { pool, init, one, many, run };
