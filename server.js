require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const db = require("./db");
const ai = require("./ai");

const app = express();
app.use(cors());
app.use(express.json({ limit: "12mb" })); // photos travel as base64 in JSON

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("Missing JWT_SECRET in environment. Set one before starting the server.");
  process.exit(1);
}

function slugName(name) {
  return (name || "anon").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "anon";
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function sign(user) {
  return jwt.sign({ id: user.id, name: user.name, handle: user.handle }, JWT_SECRET, { expiresIn: "180d" });
}
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not signed in." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Session expired — sign in again." });
  }
}

/* ---------------- auth ---------------- */
app.post("/api/register", (req, res) => {
  const { name, password, bio } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required." });
  if (!password || password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  const nameLower = name.trim().toLowerCase();
  const existing = db.prepare("SELECT id FROM users WHERE name_lower = ?").get(nameLower);
  if (existing) return res.status(409).json({ error: "That name is already taken. Try another." });

  const handle = `${slugName(name)}-${uid().slice(0, 5)}`;
  const passwordHash = bcrypt.hashSync(password, 10);
  const createdAt = Date.now();
  const info = db.prepare(
    "INSERT INTO users (name, name_lower, handle, bio, password_hash, created_at) VALUES (?,?,?,?,?,?)"
  ).run(name.trim(), nameLower, handle, (bio || "").trim(), passwordHash, createdAt);
  db.prepare("INSERT INTO user_data (user_id) VALUES (?)").run(info.lastInsertRowid);

  const user = { id: info.lastInsertRowid, name: name.trim(), handle };
  res.json({ token: sign(user), user: { name: user.name, handle: user.handle, bio: (bio || "").trim() } });
});

app.post("/api/login", (req, res) => {
  const { name, password } = req.body || {};
  if (!name || !password) return res.status(400).json({ error: "Name and password are required." });
  const row = db.prepare("SELECT * FROM users WHERE name_lower = ?").get(name.trim().toLowerCase());
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: "Name or password is wrong." });
  }
  res.json({ token: sign(row), user: { name: row.name, handle: row.handle, bio: row.bio } });
});

/* ---------------- personal data ---------------- */
app.get("/api/me/data", auth, (req, res) => {
  const row = db.prepare("SELECT * FROM user_data WHERE user_id = ?").get(req.user.id);
  const user = db.prepare("SELECT name, bio, handle FROM users WHERE id = ?").get(req.user.id);
  res.json({
    profile: user,
    gallery: JSON.parse(row.gallery_json),
    canon: JSON.parse(row.canon_json),
    visits: JSON.parse(row.visits_json),
    uiTheme: row.ui_theme,
    galleryWall: row.gallery_wall,
  });
});

app.put("/api/me/gallery", auth, (req, res) => {
  db.prepare("UPDATE user_data SET gallery_json = ? WHERE user_id = ?").run(JSON.stringify(req.body.gallery || []), req.user.id);
  res.json({ ok: true });
});
app.put("/api/me/canon", auth, (req, res) => {
  db.prepare("UPDATE user_data SET canon_json = ? WHERE user_id = ?").run(JSON.stringify(req.body.canon || []), req.user.id);
  res.json({ ok: true });
});
app.put("/api/me/visits", auth, (req, res) => {
  db.prepare("UPDATE user_data SET visits_json = ? WHERE user_id = ?").run(JSON.stringify(req.body.visits || []), req.user.id);
  res.json({ ok: true });
});
app.put("/api/me/prefs", auth, (req, res) => {
  const { uiTheme, galleryWall } = req.body || {};
  db.prepare("UPDATE user_data SET ui_theme = COALESCE(?, ui_theme), gallery_wall = COALESCE(?, gallery_wall) WHERE user_id = ?")
    .run(uiTheme || null, galleryWall || null, req.user.id);
  res.json({ ok: true });
});
app.post("/api/me/reset", auth, (req, res) => {
  db.prepare("UPDATE user_data SET gallery_json='[]', canon_json='[]', visits_json='[]' WHERE user_id = ?").run(req.user.id);
  res.json({ ok: true });
});

app.put("/api/me/canon/publish", auth, (req, res) => {
  const { items, bio } = req.body || {};
  const user = db.prepare("SELECT name, handle FROM users WHERE id = ?").get(req.user.id);
  db.prepare(`
    INSERT INTO published_canons (user_id, handle, name, bio, items_json, updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET items_json = excluded.items_json, bio = excluded.bio, updated_at = excluded.updated_at
  `).run(req.user.id, user.handle, user.name, bio || "", JSON.stringify((items || []).slice(0, 12)), Date.now());
  res.json({ ok: true });
});

/* ---------------- shared / community ---------------- */
app.get("/api/feed", (req, res) => {
  const rows = db.prepare("SELECT * FROM feed WHERE report_count < 3 ORDER BY created_at DESC LIMIT 80").all();
  res.json(rows);
});
app.post("/api/feed", auth, (req, res) => {
  const { museum, exhibit, rating, note, date } = req.body || {};
  if (!museum) return res.status(400).json({ error: "Museum is required." });
  db.prepare(
    "INSERT INTO feed (user_id, author_name, museum, exhibit, rating, note, date, created_at) VALUES (?,?,?,?,?,?,?,?)"
  ).run(req.user.id, req.user.name, museum, exhibit || "", rating || null, note || "", date || "", Date.now());
  res.json({ ok: true });
});
app.post("/api/feed/:id/report", (req, res) => {
  db.prepare("UPDATE feed SET report_count = report_count + 1 WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.get("/api/museums/community", (req, res) => {
  res.json(db.prepare("SELECT name, city, added_by, created_at FROM community_museums ORDER BY created_at DESC LIMIT 2000").all());
});
app.post("/api/museums/community", auth, (req, res) => {
  const { name, city } = req.body || {};
  if (!name || !city) return res.status(400).json({ error: "Name and city are required." });
  db.prepare("INSERT INTO community_museums (name, city, added_by, created_at) VALUES (?,?,?,?)").run(name, city, req.user.name, Date.now());
  res.json({ ok: true });
});

app.get("/api/discover", (req, res) => {
  const rows = db.prepare("SELECT handle, name, bio, items_json, updated_at FROM published_canons ORDER BY updated_at DESC LIMIT 40").all();
  res.json(rows.map((r) => ({ handle: r.handle, name: r.name, bio: r.bio, items: JSON.parse(r.items_json), updatedAt: r.updated_at })));
});

app.get("/api/notes/:slug", (req, res) => {
  const rows = db.prepare("SELECT text, created_at as at FROM notes WHERE slug = ? ORDER BY created_at DESC LIMIT 40").all(req.params.slug);
  res.json(rows);
});
app.post("/api/notes/:slug", (req, res) => {
  const text = (req.body?.text || "").trim().slice(0, 280);
  if (!text) return res.status(400).json({ error: "Note text is required." });
  db.prepare("INSERT INTO notes (slug, text, created_at) VALUES (?,?,?)").run(req.params.slug, text, Date.now());
  res.json({ ok: true });
});

/* ---------------- AI proxy — the key lives only here ---------------- */
app.post("/api/ai/identify", auth, async (req, res) => {
  try { res.json(await ai.identifyArtwork(req.body.imageBase64)); }
  catch (e) { console.error(e); res.status(500).json({ error: "AI call failed." }); }
});
app.post("/api/ai/locate", auth, async (req, res) => {
  try { res.json(await ai.locateMuseum(req.body.lat, req.body.lng)); }
  catch (e) { console.error(e); res.status(500).json({ error: "AI call failed." }); }
});
app.post("/api/ai/curator-note", auth, async (req, res) => {
  try { res.json({ text: await ai.curatorNote(req.body.works || []) }); }
  catch (e) { console.error(e); res.status(500).json({ error: "AI call failed." }); }
});
app.post("/api/ai/compare", auth, async (req, res) => {
  try { res.json({ text: await ai.compareCanons(req.body.mine || [], req.body.theirs || []) }); }
  catch (e) { console.error(e); res.status(500).json({ error: "AI call failed." }); }
});
app.post("/api/ai/plan-visit", auth, async (req, res) => {
  try { res.json(await ai.planVisit(req.body.city, req.body.knownMuseums || [])); }
  catch (e) { console.error(e); res.status(500).json({ error: "AI call failed." }); }
});

/* ---------------- static frontend ---------------- */
app.use(express.static(__dirname));
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found." });
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Patinir server running on http://localhost:${PORT}`));
