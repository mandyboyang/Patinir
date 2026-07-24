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
  const { name, password, bio, accountType, museumSlug } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required." });
  if (!password || password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  const nameLower = name.trim().toLowerCase();
  const existing = db.prepare("SELECT id FROM users WHERE name_lower = ?").get(nameLower);
  if (existing) return res.status(409).json({ error: "That name is already taken. Try another." });

  const isMuseum = accountType === "museum";
  if (isMuseum) {
    if (!museumSlug) return res.status(400).json({ error: "Pick which museum you're claiming." });
    const claimed = db.prepare("SELECT id FROM users WHERE museum_slug = ? AND account_type = 'museum'").get(museumSlug);
    if (claimed) return res.status(409).json({ error: "This museum has already been claimed by another account." });
  }

  const handle = `${slugName(name)}-${uid().slice(0, 5)}`;
  const passwordHash = bcrypt.hashSync(password, 10);
  const createdAt = Date.now();
  const info = db.prepare(
    "INSERT INTO users (name, name_lower, handle, bio, password_hash, account_type, museum_slug, created_at) VALUES (?,?,?,?,?,?,?,?)"
  ).run(name.trim(), nameLower, handle, (bio || "").trim(), passwordHash, isMuseum ? "museum" : "personal", isMuseum ? museumSlug : null, createdAt);
  db.prepare("INSERT INTO user_data (user_id) VALUES (?)").run(info.lastInsertRowid);

  const user = { id: info.lastInsertRowid, name: name.trim(), handle };
  res.json({ token: sign(user), user: { name: user.name, handle: user.handle, bio: (bio || "").trim(), accountType: isMuseum ? "museum" : "personal", museumSlug: isMuseum ? museumSlug : null } });
});

app.post("/api/login", (req, res) => {
  const { name, password } = req.body || {};
  if (!name || !password) return res.status(400).json({ error: "Name and password are required." });
  const row = db.prepare("SELECT * FROM users WHERE name_lower = ?").get(name.trim().toLowerCase());
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: "Name or password is wrong." });
  }
  res.json({ token: sign(row), user: { name: row.name, handle: row.handle, bio: row.bio, accountType: row.account_type, museumSlug: row.museum_slug } });
});

/* ---------------- personal data ---------------- */
app.get("/api/me/data", auth, (req, res) => {
  const row = db.prepare("SELECT * FROM user_data WHERE user_id = ?").get(req.user.id);
  const user = db.prepare("SELECT name, bio, handle, account_type, museum_slug, profile_public FROM users WHERE id = ?").get(req.user.id);
  res.json({
    profile: { name: user.name, bio: user.bio, handle: user.handle, accountType: user.account_type, museumSlug: user.museum_slug, profilePublic: !!user.profile_public },
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

/* ---------------- museum accounts ---------------- */
app.get("/api/museums/accounts", (req, res) => {
  res.json(db.prepare("SELECT name, handle, bio, museum_slug FROM users WHERE account_type = 'museum'").all());
});

app.get("/api/museums/:slug/profile", (req, res) => {
  const slug = req.params.slug;
  const account = db.prepare("SELECT name, bio, handle FROM users WHERE museum_slug = ? AND account_type = 'museum'").get(slug);
  const posts = db.prepare("SELECT id, text, created_at FROM museum_posts WHERE museum_slug = ? ORDER BY created_at DESC LIMIT 20").all(slug);
  const picks = db.prepare("SELECT id, work, artist, note FROM museum_picks WHERE museum_slug = ? ORDER BY created_at DESC LIMIT 20").all(slug);
  const followerCount = db.prepare("SELECT COUNT(*) as c FROM follows WHERE museum_slug = ?").get(slug).c;
  res.json({ claimed: !!account, name: account?.name || null, bio: account?.bio || null, posts, picks, followerCount });
});

function requireMuseumOwner(req, res, next) {
  const row = db.prepare("SELECT account_type, museum_slug FROM users WHERE id = ?").get(req.user.id);
  if (!row || row.account_type !== "museum" || row.museum_slug !== req.params.slug) {
    return res.status(403).json({ error: "You don't manage this museum's account." });
  }
  next();
}

app.post("/api/museums/:slug/posts", auth, requireMuseumOwner, (req, res) => {
  const text = (req.body?.text || "").trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: "Post text is required." });
  db.prepare("INSERT INTO museum_posts (museum_slug, user_id, text, created_at) VALUES (?,?,?,?)").run(req.params.slug, req.user.id, text, Date.now());
  res.json({ ok: true });
});

app.post("/api/museums/:slug/picks", auth, requireMuseumOwner, (req, res) => {
  const { work, artist, note } = req.body || {};
  if (!work || !work.trim()) return res.status(400).json({ error: "A work name is required." });
  db.prepare("INSERT INTO museum_picks (museum_slug, work, artist, note, created_at) VALUES (?,?,?,?,?)").run(req.params.slug, work.trim(), (artist || "").trim(), (note || "").trim(), Date.now());
  res.json({ ok: true });
});

app.post("/api/follow/:slug", auth, (req, res) => {
  db.prepare("INSERT OR IGNORE INTO follows (user_id, museum_slug, created_at) VALUES (?,?,?)").run(req.user.id, req.params.slug, Date.now());
  res.json({ ok: true });
});
app.delete("/api/follow/:slug", auth, (req, res) => {
  db.prepare("DELETE FROM follows WHERE user_id = ? AND museum_slug = ?").run(req.user.id, req.params.slug);
  res.json({ ok: true });
});
app.get("/api/me/following", auth, (req, res) => {
  res.json(db.prepare("SELECT museum_slug FROM follows WHERE user_id = ?").all(req.user.id).map((r) => r.museum_slug));
});

app.get("/api/museum-feed", auth, (req, res) => {
  const rows = db.prepare(`
    SELECT mp.id, mp.museum_slug, mp.text, mp.created_at, u.name as museum_name
    FROM museum_posts mp
    JOIN follows f ON f.museum_slug = mp.museum_slug AND f.user_id = ?
    JOIN users u ON u.museum_slug = mp.museum_slug AND u.account_type = 'museum'
    ORDER BY mp.created_at DESC LIMIT 60
  `).all(req.user.id);
  res.json(rows);
});

/* ---------------- shared / community ---------------- */
app.get("/api/feed", (req, res) => {
  const rows = db.prepare("SELECT * FROM feed WHERE report_count < 3 ORDER BY created_at DESC LIMIT 80").all();
  res.json(rows);
});
app.post("/api/feed", auth, (req, res) => {
  const { kind, museum, exhibit, rating, note, date, title, artist, medium, subject, imageDataUrl } = req.body || {};
  const isPiece = kind === "piece";
  if (isPiece) {
    if (!title || !title.trim()) return res.status(400).json({ error: "Title is required." });
  } else if (!museum) {
    return res.status(400).json({ error: "Museum is required." });
  }
  db.prepare(
    "INSERT INTO feed (user_id, author_name, kind, museum, exhibit, rating, note, date, title, artist, medium, subject, image_data_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).run(req.user.id, req.user.name, isPiece ? "piece" : "visit", museum || null, exhibit || "", rating || null, note || "", date || "", title || null, artist || null, medium || null, subject || null, imageDataUrl || null, Date.now());
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
  const rows = db.prepare("SELECT name, handle, bio FROM users WHERE profile_public = 1 AND account_type = 'personal' ORDER BY id DESC LIMIT 60").all();
  res.json(rows);
});

app.put("/api/me/visibility", auth, (req, res) => {
  db.prepare("UPDATE users SET profile_public = ? WHERE id = ?").run(req.body?.public ? 1 : 0, req.user.id);
  res.json({ ok: true });
});

app.get("/api/profile/:handle", (req, res) => {
  const user = db.prepare("SELECT id, name, bio, profile_public FROM users WHERE handle = ? AND account_type = 'personal'").get(req.params.handle);
  if (!user || !user.profile_public) return res.status(404).json({ error: "This profile is private or doesn't exist." });
  const data = db.prepare("SELECT gallery_json, canon_json, visits_json FROM user_data WHERE user_id = ?").get(user.id);
  const gallery = JSON.parse(data.gallery_json || "[]").map((w) => {
    // Never leave the personal-reflection fields visible, even on a public profile —
    // those are private by design regardless of what else the person opts to share.
    const { personalMeaning, reflectionNotes, ...safe } = w;
    return safe;
  });
  const canonIds = JSON.parse(data.canon_json || "[]");
  const byId = Object.fromEntries(gallery.map((w) => [w.id, w]));
  const canon = canonIds.map((id) => byId[id]).filter(Boolean);
  const visitCount = new Set(JSON.parse(data.visits_json || "[]").map((v) => v.museum)).size;
  res.json({ name: user.name, bio: user.bio, gallery, canon, visitCount });
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
app.post("/api/ai/guide-reflection", auth, async (req, res) => {
  try { res.json(await ai.guideReflection(req.body.imageBase64)); }
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
