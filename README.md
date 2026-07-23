# Patinir — real website version

This is a full rewrite of the Claude-artifact version into an actual, independently
hosted site: a real Express server, a real SQLite database, real password accounts,
and a secure server-side connection to Claude for the AI features (your API key is
never sent to anyone's browser).

## What's here
```
server/         Node/Express backend + SQLite database
  server.js     All routes: auth, data, community features, AI proxy
  db.js         Database schema (auto-created on first boot)
  ai.js         The only file that talks to Anthropic — holds your API key
public/         The frontend — plain HTML/JS, no build step
  index.html    Loads React + Babel from a CDN
  app.js        The actual app (JSX, transpiled in-browser)
```

## 1. Test it on your own machine first (10 min)
```
cd server
npm install
cp .env.example .env
```
Open `.env` and fill in:
- `JWT_SECRET` — run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and paste the output
- `ANTHROPIC_API_KEY` — from **console.anthropic.com** (this is a *different* account
  from your claude.ai login — it's Anthropic's developer platform, billed separately
  and pay-as-you-go). Create an account there, add a small amount of credit, and
  generate a key under "API Keys."

Then:
```
npm start
```
Open `http://localhost:3000` — create an account, add a piece, everything should work
exactly like the artifact version did, because it's now hitting your own server instead
of Claude's storage.

## 2. Put it online (Render — one account, no credit card to start)

This repo includes `render.yaml`, so Render can configure almost everything itself:

1. Push this whole folder to a new GitHub repo (drag-and-drop the folder into
   GitHub's "create a new repository → upload files" page works fine — no git
   command line needed).
2. Go to **render.com**, sign up, click **New → Blueprint**, connect that repo.
3. Render reads `render.yaml` and shows you exactly one field to fill in:
   **ANTHROPIC_API_KEY** (get this from **console.anthropic.com** — a different,
   separate account from your claude.ai login; it's Anthropic's developer platform,
   billed pay-as-you-go). `JWT_SECRET` is generated for you automatically.
4. Click **Deploy Blueprint**. Render gives you a URL like
   `https://patinir.onrender.com` — that's the real link. No Claude account, no
   download, works on any phone or computer.

**The one honest catch:** Render's free tier doesn't guarantee your SQLite file
survives every redeploy — for testing with friends this week, worst case is
everyone re-creates their account once. If you want that risk gone entirely
(recommended once people you care about are actually using it), open the service's
**Settings → Disks** and add a persistent disk (this requires moving off the free
plan, ~$7/month), then update `DB_PATH` to point at that disk's mount path.

## Real costs, stated plainly
- **Render:** free to start; ~$7/month once you want guaranteed data persistence.
- **Anthropic API:** pay-per-request, separate from any Claude.ai subscription.
  Check current pricing at console.anthropic.com — for a handful of friends using
  this casually, it's realistically a few dollars a month, not more, but usage-based
  means there's no fixed cap unless you set one in the console.

## Known, deliberate simplifications (fine for an MVP, worth knowing about)
- **No build step.** The frontend transpiles JSX in the browser instead of ahead of
  time. Faster to ship, slightly slower to load than a "real" production build —
  swapping in Vite later is a reasonable next step, not urgent.
- **Images are stored as base64 text in SQLite**, not a separate file/blob store.
  Totally fine at friends-scale; would want to move to real object storage (e.g. S3)
  if this ever has hundreds of users each with dozens of photos.
- **SQLite** handles this app's write volume easily at small scale. If this ever gets
  genuinely popular, migrating to Postgres is the natural next step.

## Want changes after this is live?
Come back to this conversation and ask — I can keep editing this same code. You'll
just need to `git push` the updated files and redeploy (Render redeploys
automatically on every push once it's connected to your repo).
