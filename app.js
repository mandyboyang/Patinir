import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import ReactDOM from "react-dom/client";
import {
  MapPin, Star, Plus, Sparkles, ChevronUp, ChevronDown, X,
  Loader2, Share2, Users, RotateCcw, Image as ImageIcon, Flag, Search, MessageSquare, Palette, LogOut,
} from "lucide-react";

/* ============================= API client — talks only to OUR server ============================= */
/* The browser never talks to Anthropic directly and never sees an API key.
   Every AI call below is a fetch to our own /api/ai/* routes. */
const TOKEN_KEY = "patinir_token";
let authToken = localStorage.getItem(TOKEN_KEY) || null;
function setToken(t) {
  authToken = t;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}
async function apiFetch(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
const api = {
  register: (name, password, bio, accountType, museumSlug) => apiFetch("/api/register", { method: "POST", body: { name, password, bio, accountType, museumSlug } }),
  login: (name, password) => apiFetch("/api/login", { method: "POST", body: { name, password } }),
  getMyData: () => apiFetch("/api/me/data"),
  saveGallery: (gallery) => apiFetch("/api/me/gallery", { method: "PUT", body: { gallery } }),
  saveCanon: (canon) => apiFetch("/api/me/canon", { method: "PUT", body: { canon } }),
  saveVisits: (visits) => apiFetch("/api/me/visits", { method: "PUT", body: { visits } }),
  savePrefs: (prefs) => apiFetch("/api/me/prefs", { method: "PUT", body: prefs }),
  resetMyData: () => apiFetch("/api/me/reset", { method: "POST" }),
  getFeed: () => apiFetch("/api/feed"),
  postFeed: (entry) => apiFetch("/api/feed", { method: "POST", body: entry }),
  reportFeed: (id) => apiFetch(`/api/feed/${id}/report`, { method: "POST" }),
  getCommunityMuseums: () => apiFetch("/api/museums/community"),
  addCommunityMuseumApi: (name, city) => apiFetch("/api/museums/community", { method: "POST", body: { name, city } }),
  getDiscover: () => apiFetch("/api/discover"),
  getProfile: (handle) => apiFetch(`/api/profile/${handle}`),
  setVisibility: (isPublic) => apiFetch("/api/me/visibility", { method: "PUT", body: { public: isPublic } }),
  getNotes: (slug) => apiFetch(`/api/notes/${slug}`),
  postNote: (slug, text) => apiFetch(`/api/notes/${slug}`, { method: "POST", body: { text } }),
  identifyArtworkApi: (imageBase64) => apiFetch("/api/ai/identify", { method: "POST", body: { imageBase64 } }),
  guideReflectionApi: (imageBase64) => apiFetch("/api/ai/guide-reflection", { method: "POST", body: { imageBase64 } }),
  locateMuseumApi: (lat, lng) => apiFetch("/api/ai/locate", { method: "POST", body: { lat, lng } }),
  curatorNoteApi: (works) => apiFetch("/api/ai/curator-note", { method: "POST", body: { works } }),
  compareCanonsApi: (mine, theirs) => apiFetch("/api/ai/compare", { method: "POST", body: { mine, theirs } }),
  planVisitApi: (city, knownMuseums) => apiFetch("/api/ai/plan-visit", { method: "POST", body: { city, knownMuseums } }),
  getMuseumAccounts: () => apiFetch("/api/museums/accounts"),
  getMuseumProfile: (slug) => apiFetch(`/api/museums/${slug}/profile`),
  postMuseumPost: (slug, text) => apiFetch(`/api/museums/${slug}/posts`, { method: "POST", body: { text } }),
  postMuseumPick: (slug, work, artist, note) => apiFetch(`/api/museums/${slug}/picks`, { method: "POST", body: { work, artist, note } }),
  followMuseum: (slug) => apiFetch(`/api/follow/${slug}`, { method: "POST" }),
  unfollowMuseum: (slug) => apiFetch(`/api/follow/${slug}`, { method: "DELETE" }),
  getFollowing: () => apiFetch("/api/me/following"),
  getMuseumFeed: () => apiFetch("/api/museum-feed"),
};
// Thin wrappers so every AI call site elsewhere in this file reads exactly like the
// artifact version did — only these five functions know they're hitting our server now.
async function aiIdentifyArtwork(imageDataUrl) { try { return await api.identifyArtworkApi(imageDataUrl.split(",")[1]); } catch (e) { console.error(e); return null; } }
async function aiGuideReflection(imageDataUrl) { try { return await api.guideReflectionApi(imageDataUrl.split(",")[1]); } catch (e) { console.error(e); return null; } }
async function aiLocateMuseum(lat, lng) { try { return await api.locateMuseumApi(lat, lng); } catch (e) { console.error(e); return null; } }
async function aiCuratorNote(canonWorks) { try { return (await api.curatorNoteApi(canonWorks))?.text || null; } catch (e) { console.error(e); return null; } }
async function aiCompareCanons(mine, theirs) { try { return (await api.compareCanonsApi(mine, theirs))?.text || null; } catch (e) { console.error(e); return null; } }
async function aiPlanVisit(city, knownMuseums) { try { return await api.planVisitApi(city, knownMuseums); } catch (e) { console.error(e); return null; } }

/* ============================= tokens & themes ============================= */
const T = {
  paper: "var(--c-paper)", card: "var(--c-card)", ink: "var(--c-ink)", hair: "var(--c-hair)",
  muted: "var(--c-muted)", accent: "var(--c-accent)", accentSoft: "var(--c-accent-soft)",
  moss: "var(--c-moss)", horizon: "var(--c-horizon)", seal: "var(--c-seal)", gold: "var(--c-gold)",
  paperAlpha: "var(--c-paper-alpha)",
};
const THEMES = {
  patinir: { label: "Patinir", hint: "Warm parchment, daylight", paper: "#EFE9DC", card: "#F8F3E7", ink: "#2A2620", hair: "#D9D0BC", muted: "#8A8271", accent: "#7C5527", accentSoft: "#9C6B33", moss: "#4B6A4E", horizon: "#3A5478", seal: "#8B3A2B", gold: "#AB8A3F", paperAlpha: "rgba(239,233,220,0.82)" },
  nocturne: { label: "Nocturne", hint: "After-hours, low light", paper: "#1A1815", card: "#242019", ink: "#EDE5D6", hair: "#3B3630", muted: "#9C9483", accent: "#D9A455", accentSoft: "#C08A3E", moss: "#7FA184", horizon: "#7C9AC7", seal: "#D9705A", gold: "#E3BE72", paperAlpha: "rgba(26,24,21,0.78)" },
  marble: { label: "Marble", hint: "Gallery white, minimal", paper: "#F4F3F0", card: "#FFFFFF", ink: "#211F1C", hair: "#DEDBD4", muted: "#87837A", accent: "#2E2C28", accentSoft: "#4A473F", moss: "#4B6A4E", horizon: "#3A5478", seal: "#8B3A2B", gold: "#AB8A3F", paperAlpha: "rgba(244,243,240,0.82)" },
};
function themeCSSVars(t) {
  return `--c-paper:${t.paper};--c-card:${t.card};--c-ink:${t.ink};--c-hair:${t.hair};--c-muted:${t.muted};--c-accent:${t.accent};--c-accent-soft:${t.accentSoft};--c-moss:${t.moss};--c-horizon:${t.horizon};--c-seal:${t.seal};--c-gold:${t.gold};--c-paper-alpha:${t.paperAlpha};`;
}
const WALL_STYLES = {
  plain: { label: "Plain" },
  vignette: { label: "Soft vignette", style: { backgroundImage: "radial-gradient(ellipse 900px 500px at 50% 0%, transparent 0%, rgba(0,0,0,0.055) 100%)" } },
  grain: { label: "Paper grain", style: { backgroundImage: "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.05) 1px, transparent 0)", backgroundSize: "5px 5px" } },
};

const FONTS = (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,400..600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
    :root { ${themeCSSVars(THEMES.patinir)} }
    html, body { margin: 0; }
    .f-display { font-family: 'Fraunces', serif; }
    .f-body { font-family: 'IBM Plex Sans', sans-serif; }
    .f-mono { font-family: 'IBM Plex Mono', monospace; letter-spacing: 0.03em; }
    * { box-sizing: border-box; }
    input:focus, textarea:focus, button:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 1px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-thumb { background: var(--c-hair); border-radius: 4px; }
    .pat-card { transition: transform .15s ease, box-shadow .15s ease, background-color .2s ease, border-color .2s ease; }
    @media (prefers-reduced-motion: no-preference) {
      .pat-card:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,0.12); }
      .pat-modal-in { animation: patModalIn .18s ease; }
      .pat-tab-fade { animation: patFadeIn .22s ease; }
      body, .f-body, .f-mono, .f-display { transition: background-color .25s ease, border-color .25s ease, color .25s ease; }
    }
    @keyframes patModalIn { from { opacity: 0; transform: scale(0.96) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
    @keyframes patFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    /* The one moving signature: a slow, ambient Weltlandschaft on the sign-in screen —
       Patinir's own three-tone recession (ochre near, moss mid, horizon far), drifting
       almost imperceptibly. A small triangular sail nods to Charon Crossing the Styx,
       the painting that ties this app's name to its own logo. */
    .pat-horizon { position: relative; height: 140px; margin: -20px -20px 22px; overflow: hidden; border-bottom: 1px solid var(--c-hair); }
    .pat-horizon-sky { position: absolute; inset: 0; background: linear-gradient(to bottom, var(--c-horizon) 0%, transparent 85%); opacity: 0.4; }
    .pat-horizon-hill { position: absolute; bottom: -12px; left: -12%; width: 130%; height: 64px; }
    .pat-horizon-hill-far { background: var(--c-moss); opacity: 0.32; clip-path: polygon(0% 100%, 0% 45%, 15% 58%, 30% 32%, 45% 52%, 60% 24%, 75% 48%, 90% 28%, 100% 42%, 100% 100%); }
    .pat-horizon-hill-near { background: var(--c-accent-soft); opacity: 0.42; bottom: -16px; height: 50px; clip-path: polygon(0% 100%, 0% 62%, 20% 38%, 35% 60%, 55% 28%, 70% 55%, 85% 32%, 100% 50%, 100% 100%); }
    .pat-horizon-boat { position: absolute; bottom: 26px; left: 8%; width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 9px solid var(--c-seal); opacity: 0.55; }
    @media (prefers-reduced-motion: no-preference) {
      .pat-horizon-hill-far { animation: patDriftFar 70s ease-in-out infinite alternate; }
      .pat-horizon-hill-near { animation: patDriftNear 45s ease-in-out infinite alternate; }
      .pat-horizon-boat { animation: patSail 55s linear infinite; }
    }
    @keyframes patDriftFar { from { transform: translateX(-3%); } to { transform: translateX(3%); } }
    @keyframes patDriftNear { from { transform: translateX(2%); } to { transform: translateX(-4%); } }
    @keyframes patSail { from { left: -6%; } to { left: 104%; } }
    .pat-tilt { transition: transform .1s ease-out, box-shadow .15s ease; will-change: transform; }
  `}</style>
);

/* ============================= curated museum database ============================= */
const MUSEUM_DB = {
  "Seoul": ["National Museum of Korea", "MMCA Seoul", "Leeum Museum of Art", "Seoul Museum of Art (SeMA)", "Amorepacific Museum of Art", "Daelim Museum", "Art Sonje Center", "D Museum", "Arario Museum in Space", "National Palace Museum of Korea"],
  "New York": ["The Metropolitan Museum of Art", "MoMA", "Whitney Museum of American Art", "Guggenheim Museum", "Brooklyn Museum", "The Frick Collection", "New Museum", "The Morgan Library & Museum", "Neue Galerie", "The Cloisters"],
  "Paris": ["Louvre", "Musée d'Orsay", "Centre Pompidou", "Musée Rodin", "Musée de l'Orangerie", "Musée Picasso", "Petit Palais", "Musée Marmottan Monet", "Fondation Louis Vuitton", "Palais de Tokyo"],
  "London": ["British Museum", "National Gallery", "Tate Modern", "Tate Britain", "Victoria and Albert Museum", "National Portrait Gallery", "Wallace Collection", "Courtauld Gallery", "Serpentine Galleries", "Design Museum", "Hayward Gallery"],
  "Tokyo": ["Tokyo National Museum", "Mori Art Museum", "National Museum of Western Art", "National Museum of Modern Art, Tokyo", "Nezu Museum", "Artizon Museum", "21_21 Design Sight", "teamLab Planets", "Yayoi Kusama Museum"],
  "Rome": ["Vatican Museums", "Galleria Borghese", "MAXXI", "Capitoline Museums", "Palazzo Barberini", "Galleria Doria Pamphilj"],
  "Florence": ["Uffizi Gallery", "Galleria dell'Accademia", "Palazzo Pitti", "Bargello Museum", "Museo dell'Opera del Duomo", "Museo di San Marco"],
  "Madrid": ["Museo del Prado", "Museo Reina Sofía", "Museo Thyssen-Bornemisza", "Museo Sorolla", "CaixaForum Madrid"],
  "Amsterdam": ["Rijksmuseum", "Van Gogh Museum", "Stedelijk Museum", "Moco Museum", "Hermitage Amsterdam", "Rembrandt House Museum"],
  "Berlin": ["Pergamon Museum", "Neue Nationalgalerie", "Alte Nationalgalerie", "Gemäldegalerie", "Hamburger Bahnhof", "Museum Berggruen", "Bode Museum"],
  "Vienna": ["Kunsthistorisches Museum", "Belvedere", "Leopold Museum", "MUMOK", "Albertina"],
  "Chicago": ["Art Institute of Chicago", "Museum of Contemporary Art Chicago", "Smart Museum of Art", "Driehaus Museum"],
  "Los Angeles": ["LACMA", "The Getty Center", "The Broad", "MOCA Los Angeles", "Hammer Museum", "Norton Simon Museum", "The Huntington"],
  "San Francisco": ["SFMOMA", "de Young Museum", "Legion of Honor", "Asian Art Museum"],
  "Washington DC": ["National Gallery of Art", "Smithsonian American Art Museum", "Hirshhorn Museum", "National Portrait Gallery", "National Museum of Asian Art", "The Phillips Collection"],
  "Boston": ["Museum of Fine Arts, Boston", "Isabella Stewart Gardner Museum", "ICA Boston"],
  "Toronto": ["Art Gallery of Ontario", "Royal Ontario Museum", "Gardiner Museum"],
  "Mexico City": ["Museo Nacional de Antropología", "Palacio de Bellas Artes", "Museo Frida Kahlo", "Museo Soumaya", "Museo Tamayo", "Museo Jumex"],
  "São Paulo": ["MASP", "Pinacoteca de São Paulo", "Museu de Arte Moderna (MAM)"],
  "Buenos Aires": ["Museo Nacional de Bellas Artes", "MALBA", "Museo de Arte Moderno de Buenos Aires"],
  "Beijing": ["National Museum of China", "Palace Museum", "UCCA Center for Contemporary Art", "798 Art Zone", "Capital Museum"],
  "Shanghai": ["Shanghai Museum", "Power Station of Art", "Long Museum", "Yuz Museum", "Museum of Art Pudong (MAP)"],
  "Hong Kong": ["M+", "Hong Kong Museum of Art", "Hong Kong Palace Museum"],
  "Sydney": ["Art Gallery of New South Wales", "Museum of Contemporary Art Australia", "White Rabbit Gallery"],
  "Melbourne": ["National Gallery of Victoria", "ACCA", "Heide Museum of Modern Art"],
  "Barcelona": ["Museu Picasso", "Fundació Joan Miró", "MACBA", "Museu Nacional d'Art de Catalunya"],
  "Venice": ["Peggy Guggenheim Collection", "Gallerie dell'Accademia", "Palazzo Grassi", "Punta della Dogana"],
  "Copenhagen": ["SMK – National Gallery of Denmark", "Louisiana Museum of Modern Art", "Ny Carlsberg Glyptotek"],
  "St. Petersburg": ["The Hermitage Museum", "Russian Museum", "Fabergé Museum"],
  "Istanbul": ["Istanbul Modern", "Pera Museum", "Sakıp Sabancı Museum"],
  "Kyoto": ["Kyoto National Museum", "Kyoto Museum of Contemporary Art", "Fukuda Art Museum"],
  "Osaka": ["Osaka Municipal Museum of Art", "National Museum of Art, Osaka"],
  "Singapore": ["National Gallery Singapore", "ArtScience Museum", "Singapore Art Museum"],
  "Bangkok": ["Bangkok Art and Culture Centre", "Museum of Contemporary Art Bangkok (MOCA)"],
  "Delhi": ["National Gallery of Modern Art", "National Museum, New Delhi"],
  "Mumbai": ["Chhatrapati Shivaji Maharaj Vastu Sangrahalaya", "Jehangir Art Gallery"],
  "Cairo": ["Egyptian Museum", "Museum of Islamic Art, Cairo", "Grand Egyptian Museum"],
  "Athens": ["Acropolis Museum", "National Archaeological Museum of Athens", "Museum of Cycladic Art"],
  "Dublin": ["National Gallery of Ireland", "Irish Museum of Modern Art", "Chester Beatty"],
  "Brussels": ["Royal Museums of Fine Arts of Belgium", "Magritte Museum", "Bozar"],
  "Munich": ["Alte Pinakothek", "Neue Pinakothek", "Pinakothek der Moderne", "Lenbachhaus"],
  "Zurich": ["Kunsthaus Zürich", "Museum Rietberg"],
  "Lisbon": ["Museu Calouste Gulbenkian", "MAAT", "Museu Nacional de Arte Antiga"],
  "Prague": ["National Gallery Prague", "DOX Centre for Contemporary Art"],
  "Warsaw": ["National Museum in Warsaw", "Museum of Modern Art in Warsaw"],
  "Budapest": ["Museum of Fine Arts, Budapest", "Hungarian National Gallery"],
  "Helsinki": ["Ateneum", "Kiasma"],
  "Oslo": ["National Museum of Norway", "Munch Museum"],
  "Cape Town": ["Zeitz MOCAA", "Iziko South African National Gallery"],
  "Rio de Janeiro": ["Museu Nacional de Belas Artes", "Museu de Arte do Rio (MAR)", "Museu de Arte Moderna do Rio de Janeiro"],
  "Bogotá": ["Museo del Oro", "Museo Nacional de Colombia", "Botero Museum"],
  "Lima": ["Museo Larco", "MALI — Museo de Arte de Lima"],
  "Montreal": ["Montreal Museum of Fine Arts", "Musée d'art contemporain de Montréal"],
  "Vancouver": ["Vancouver Art Gallery"],
  "Philadelphia": ["Philadelphia Museum of Art", "Barnes Foundation", "Rodin Museum"],
  "Seattle": ["Seattle Art Museum", "Frye Art Museum"],
  "Minneapolis": ["Walker Art Center", "Minneapolis Institute of Art"],
  "Houston": ["The Menil Collection", "Museum of Fine Arts, Houston"],
  "Dallas": ["Dallas Museum of Art", "The Nasher Sculpture Center"],
  "Denver": ["Denver Art Museum", "Clyfford Still Museum"],
  "Atlanta": ["High Museum of Art"],
  "Auckland": ["Auckland Art Gallery Toi o Tāmaki"],
  "Wellington": ["Te Papa Tongarewa", "City Gallery Wellington"],
};
const CURATED_LIST = Object.entries(MUSEUM_DB).flatMap(([city, names]) => names.map((name) => ({ name, city, source: "curated" })));
function mergeMuseumLists(communityMuseums) {
  const seen = new Set(CURATED_LIST.map((m) => (m.name + "|" + m.city).toLowerCase()));
  const deduped = [];
  for (const m of communityMuseums) {
    const key = (m.name + "|" + m.city).toLowerCase();
    if (!seen.has(key)) { seen.add(key); deduped.push({ ...m, source: "community" }); }
  }
  return [...CURATED_LIST, ...deduped];
}
const MUST_SEES = {
  "Louvre": [{ work: "Mona Lisa", artist: "Leonardo da Vinci" }, { work: "Venus de Milo", artist: "Unknown, Hellenistic" }, { work: "Winged Victory of Samothrace", artist: "Unknown" }, { work: "Liberty Leading the People", artist: "Eugène Delacroix" }],
  "The Metropolitan Museum of Art": [{ work: "Washington Crossing the Delaware", artist: "Emanuel Leutze" }, { work: "Self-Portrait with a Straw Hat", artist: "Vincent van Gogh" }, { work: "The Death of Socrates", artist: "Jacques-Louis David" }],
  "MoMA": [{ work: "The Starry Night", artist: "Vincent van Gogh" }, { work: "Les Demoiselles d'Avignon", artist: "Pablo Picasso" }, { work: "Campbell's Soup Cans", artist: "Andy Warhol" }],
  "British Museum": [{ work: "The Rosetta Stone", artist: "Ancient Egyptian" }, { work: "The Parthenon Sculptures", artist: "Ancient Greek" }],
  "National Gallery": [{ work: "The Arnolfini Portrait", artist: "Jan van Eyck" }, { work: "Sunflowers", artist: "Vincent van Gogh" }],
  "Uffizi Gallery": [{ work: "The Birth of Venus", artist: "Sandro Botticelli" }, { work: "Primavera", artist: "Sandro Botticelli" }],
  "Museo del Prado": [{ work: "Las Meninas", artist: "Diego Velázquez" }, { work: "The Garden of Earthly Delights", artist: "Hieronymus Bosch" }],
  "Rijksmuseum": [{ work: "The Night Watch", artist: "Rembrandt van Rijn" }, { work: "The Milkmaid", artist: "Johannes Vermeer" }],
  "Van Gogh Museum": [{ work: "Sunflowers", artist: "Vincent van Gogh" }, { work: "The Potato Eaters", artist: "Vincent van Gogh" }],
  "Vatican Museums": [{ work: "The Creation of Adam, Sistine Chapel ceiling", artist: "Michelangelo" }, { work: "The School of Athens", artist: "Raphael" }],
  "Art Institute of Chicago": [{ work: "A Sunday on La Grande Jatte", artist: "Georges Seurat" }, { work: "Nighthawks", artist: "Edward Hopper" }, { work: "American Gothic", artist: "Grant Wood" }],
  "National Museum of Korea": [{ work: "Pensive Bodhisattva, gilt-bronze", artist: "Three Kingdoms period" }],
  "Leeum Museum of Art": [{ work: "Moon Jar", artist: "Joseon dynasty" }],
  "Shanghai Museum": [{ work: "The Bronze Gallery — among the finest ancient Chinese ritual-bronze collections anywhere", artist: "Various, Shang–Zhou dynasties" }],
  "Palace Museum": [{ work: "Along the River During the Qingming Festival (rarely on view — ask before you go)", artist: "Zhang Zeduan" }],
  "The Hermitage Museum": [{ work: "The Return of the Prodigal Son", artist: "Rembrandt van Rijn" }, { work: "Danaë", artist: "Titian" }],
  "Musée d'Orsay": [{ work: "Whistler's Mother", artist: "James Abbott McNeill Whistler" }, { work: "Luncheon on the Grass", artist: "Édouard Manet" }],
};

/* ============================= utils ============================= */
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0; return h; }
const PALETTES = [
  ["#D8C79A", "#8A6E4B"], ["#7C8C7A", "#3D4A3B"], ["#B5D0D8", "#4A6B74"],
  ["#D9A5A0", "#7A3B36"], ["#E3CB6A", "#8C6A1F"], ["#A7A0C4", "#4F4470"],
  ["#C9B49A", "#5C4A38"], ["#8FB0A8", "#3A554E"],
];
const paletteFor = (seed) => PALETTES[Math.abs(hashStr(seed)) % PALETTES.length];
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function slugName(name) { return (name || "anon").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "anon"; }

/* ============================= image compression + EXIF (stays 100% client-side) ============================= */
function compressImage(file, maxW = 480, quality = 0.62) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function extractExifGPS(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      try {
        const view = new DataView(reader.result);
        if (view.getUint16(0, false) !== 0xffd8) return resolve(null);
        let offset = 2, exifOffset = null;
        while (offset < view.byteLength - 4) {
          const marker = view.getUint16(offset, false);
          if (marker === 0xffda) break;
          if (marker === 0xffe1) { exifOffset = offset + 4; break; }
          if ((marker & 0xff00) !== 0xff00) break;
          offset += 2 + view.getUint16(offset + 2, false);
        }
        if (exifOffset == null) return resolve(null);
        const tiffOffset = exifOffset + 6;
        const little = view.getUint16(tiffOffset, false) === 0x4949;
        const u16 = (o) => view.getUint16(o, little);
        const u32 = (o) => view.getUint32(o, little);
        const ifd0 = tiffOffset + u32(tiffOffset + 4);
        const entries = u16(ifd0);
        let gpsIFD = null;
        for (let i = 0; i < entries; i++) { const e = ifd0 + 2 + i * 12; if (u16(e) === 0x8825) gpsIFD = tiffOffset + u32(e + 8); }
        if (gpsIFD == null) return resolve(null);
        const gpsEntries = u16(gpsIFD);
        let latRef, lngRef, lat, lng;
        const readTriple = (base) => { const parts = [0, 1, 2].map((k) => { const n = u32(base + k * 8), d = u32(base + k * 8 + 4); return d ? n / d : 0; }); return parts[0] + parts[1] / 60 + parts[2] / 3600; };
        for (let i = 0; i < gpsEntries; i++) {
          const e = gpsIFD + 2 + i * 12, tag = u16(e), valField = e + 8;
          if (tag === 0x0001) latRef = String.fromCharCode(view.getUint8(valField));
          if (tag === 0x0003) lngRef = String.fromCharCode(view.getUint8(valField));
          if (tag === 0x0002) lat = readTriple(tiffOffset + u32(valField));
          if (tag === 0x0004) lng = readTriple(tiffOffset + u32(valField));
        }
        if (lat == null || lng == null) return resolve(null);
        if (latRef === "S") lat = -lat;
        if (lngRef === "W") lng = -lng;
        resolve({ lat, lng });
      } catch (e) { resolve(null); }
    };
    reader.readAsArrayBuffer(file.slice(0, 131072));
  });
}
function extractDominantColors(imageDataUrl, n = 5) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onerror = () => resolve([]);
    img.onload = () => {
      try {
        const maxSize = 60;
        const scale = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight) || 1;
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h); // real proportions, not squashed into a square
        const data = ctx.getImageData(0, 0, w, h).data;
        const step = 24;
        const buckets = {}; // color key -> { count, sat }
        for (let i = 0; i < data.length; i += 4) {
          const r = Math.min(255, Math.round(data[i] / step) * step);
          const g = Math.min(255, Math.round(data[i + 1] / step) * step);
          const b = Math.min(255, Math.round(data[i + 2] / step) * step);
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          const key = `${r},${g},${b}`;
          if (!buckets[key]) buckets[key] = { count: 0, sat };
          buckets[key].count++;
        }
        const total = data.length / 4;
        const entries = Object.entries(buckets).map(([key, b]) => ({ key, freq: b.count / total, sat: b.sat }));
        // Vivid, notable colors first (a red accent beats a grey wall even
        // though the wall covers more pixels) — dull tones only fill in
        // afterward, so "what color speaks to you" is never just "the background."
        const MIN_SAT = 0.15;
        const vivid = entries.filter((e) => e.sat >= MIN_SAT).sort((a, b) => b.freq * b.sat - a.freq * a.sat);
        const neutrals = entries.filter((e) => e.sat < MIN_SAT).sort((a, b) => b.freq - a.freq);
        const result = [...vivid, ...neutrals].slice(0, n);
        resolve(result.map(({ key }) => "#" + key.split(",").map((v) => Number(v).toString(16).padStart(2, "0")).join("")));
      } catch (e) { resolve([]); }
    };
    img.src = imageDataUrl;
  });
}
const EMOTIONS = ["Awe", "Calm", "Melancholy", "Joy", "Longing", "Unease", "Wonder", "Nostalgia"];
const SUBJECTS = ["Portrait", "Landscape", "Still Life", "Abstract", "Figure", "Interior", "Architecture", "Nature", "Urban", "Mythological/Religious", "Historical Scene"];
const TRIGGERS = ["Color", "Composition", "Subject/Story", "Light", "Texture/Technique", "Scale/Presence"];
const SCALES = ["Intimate", "Human-scale", "Monumental"];
function eraFor(year) {
  const y = Number(year);
  if (isNaN(y) || y <= 0) return null;
  if (y < 500) return "Antiquity";
  if (y < 1400) return "Medieval";
  if (y < 1600) return "Renaissance";
  if (y < 1750) return "Baroque";
  if (y < 1900) return "18th–19th c.";
  if (y < 1945) return "Early 20th c.";
  if (y < 1980) return "Mid-20th c.";
  return "Contemporary";
}
function computeTasteStats(canonWorks) {
  const mode = (arr) => {
    if (!arr.length) return null;
    const counts = {};
    arr.forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
    const [value, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return { value, count, total: arr.length };
  };
  return {
    topSubject: mode(canonWorks.map((w) => w.subject).filter(Boolean)),
    topTrigger: mode(canonWorks.map((w) => w.trigger).filter(Boolean)),
    topScale: mode(canonWorks.map((w) => w.scale).filter(Boolean)),
    topEra: mode(canonWorks.map((w) => eraFor(w.year)).filter(Boolean)),
    mineRatio: canonWorks.length ? Math.round((canonWorks.filter((w) => w.mine).length / canonWorks.length) * 100) : 0,
  };
}

/* ============================= small UI ============================= */
function Frame({ palette, imageDataUrl, mine, size = "normal" }) {
  const h = size === "small" ? 96 : size === "large" ? 220 : 150;
  return (
    <div style={{ height: h, border: `1px solid ${T.hair}`, position: "relative", overflow: "hidden", background: imageDataUrl ? "#000" : `linear-gradient(135deg, ${palette[0]}, ${palette[1]})` }}>
      {imageDataUrl && <img src={imageDataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      {mine && <div className="f-mono" style={{ position: "absolute", top: 6, right: 6, fontSize: 9, color: "#fff", background: "rgba(0,0,0,0.4)", padding: "2px 6px", letterSpacing: "0.08em" }}>MY PHOTO</div>}
    </div>
  );
}
function Stamp({ n }) {
  return (
    <div className="f-mono" style={{ position: "absolute", top: 8, left: -8, transform: "rotate(-8deg)", zIndex: 2, color: T.seal, border: `1.5px solid ${T.seal}`, borderRadius: 2, fontSize: 10, padding: "2px 6px", background: "rgba(255,255,255,0.75)", fontWeight: 500, letterSpacing: "0.05em" }}>
      CANON № {n}
    </div>
  );
}
const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function AccessionCard({ work, canonRank, actions, onOpen }) {
  const ref = useRef(null);
  const [tilt, setTilt] = useState("");
  const onMove = (e) => {
    if (prefersReducedMotion() || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt(`perspective(700px) rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 9).toFixed(2)}deg) scale(1.015)`);
  };
  const onLeave = () => setTilt("");
  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} style={{ background: T.card, border: `1px solid ${T.hair}`, transform: tilt || undefined }} className="relative pat-card pat-tilt">
      {canonRank && <Stamp n={canonRank} />}
      <div onClick={onOpen} style={{ cursor: onOpen ? "pointer" : "default" }}>
        <Frame palette={work.palette || paletteFor(work.id)} imageDataUrl={work.imageDataUrl} mine={work.mine} />
      </div>
      <div style={{ padding: "10px 12px 12px" }}>
        <div className="f-mono" style={{ fontSize: 10, color: T.muted, marginBottom: 4 }}>{[work.acc, work.medium].filter(Boolean).join(" · ")}</div>
        <div className="f-display" style={{ fontSize: 15, color: T.ink, lineHeight: 1.25 }}>{work.title}</div>
        <div className="f-body" style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>{[work.mine ? "Taken by you" : work.artist, work.year].filter(Boolean).join(" · ")}</div>
        {(work.emotion || work.pickedColor) && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
            {work.pickedColor && <span style={{ width: 10, height: 10, borderRadius: "50%", background: work.pickedColor, display: "inline-block", border: `1px solid ${T.hair}` }} />}
            {work.emotion && <span className="f-mono" style={{ fontSize: 9.5, color: T.muted }}>{work.emotion}</span>}
          </div>
        )}
        {work.museum && <div className="f-body" style={{ fontSize: 11.5, color: T.muted, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}><MapPin size={11} /> {work.museum}</div>}
        {actions && <div style={{ marginTop: 10 }}>{actions}</div>}
      </div>
    </div>
  );
}
function SmallButton({ children, onClick, active, danger, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} className="f-mono" style={{
      fontSize: 10.5, letterSpacing: "0.06em", padding: "5px 9px",
      border: `1px solid ${danger ? T.seal : active ? T.accent : T.hair}`,
      color: danger ? T.seal : active ? "#fff" : T.ink, background: active ? T.accent : "transparent",
      cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  );
}
function Stars({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => onChange && onChange(n)} style={{ background: "none", border: "none", cursor: onChange ? "pointer" : "default", padding: 0 }}>
          <Star size={15} fill={n <= value ? T.gold : "none"} color={n <= value ? T.gold : T.hair} />
        </button>
      ))}
    </div>
  );
}
function SectionHeader({ eyebrow, title, blurb, right }) {
  return (
    <div style={{ marginBottom: 22, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
      <div>
        <div className="f-mono" style={{ fontSize: 10.5, color: T.accent, letterSpacing: "0.14em", marginBottom: 6 }}>{eyebrow}</div>
        <h1 className="f-display" style={{ fontSize: 28, color: T.ink, fontWeight: 500 }}>{title}</h1>
        {blurb && <p className="f-body" style={{ fontSize: 13.5, color: T.muted, marginTop: 6, maxWidth: 520 }}>{blurb}</p>}
      </div>
      {right}
    </div>
  );
}
function Spinner({ label }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.muted, fontSize: 13, padding: "24px 0" }}><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />{label}</div>;
}
function EmptyState({ text }) {
  return <div style={{ padding: "30px 18px", color: T.muted, fontSize: 13, border: `1px dashed ${T.hair}`, background: T.card }}>{text}</div>;
}
function Stat({ label, value }) {
  return (
    <div className="pat-card" style={{ background: T.card, border: `1px solid ${T.hair}`, padding: "16px 16px" }}>
      <div className="f-display" style={{ fontSize: 26, color: T.seal }}>{value}</div>
      <div className="f-mono" style={{ fontSize: 10, color: T.muted, marginTop: 2, letterSpacing: "0.04em" }}>{label.toUpperCase()}</div>
    </div>
  );
}
function WrappedTile({ label, value, sub, color }) {
  return (
    <div className="pat-card" style={{ background: T.card, border: `1px solid ${T.hair}`, borderTop: `3px solid ${color}`, padding: "16px 14px" }}>
      <div className="f-mono" style={{ fontSize: 8.5, color, marginBottom: 7, letterSpacing: "0.07em" }}>{label}</div>
      <div className="f-display" style={{ fontSize: 19, color: T.ink, lineHeight: 1.2, marginBottom: 5 }}>{value}</div>
      <div className="f-mono" style={{ fontSize: 9, color: T.muted }}>{sub}</div>
    </div>
  );
}
const inputStyleBase = { width: "100%", fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 13.5, padding: "9px 10px", border: `1px solid ${T.hair}`, background: "#fff", color: T.ink, outline: "none" };

/* ============================= museum picker ============================= */
function MuseumPicker({ value, onValueChange, communityMuseums, onAddCommunity }) {
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addCity, setAddCity] = useState("");
  const addOpenRef = useRef(false);
  useEffect(() => { addOpenRef.current = addOpen; }, [addOpen]);

  const combined = useMemo(() => mergeMuseumLists(communityMuseums), [communityMuseums]);
  const q = (value || "").trim().toLowerCase();
  const matches = q ? combined.filter((m) => (m.name + " " + m.city).toLowerCase().includes(q)).slice(0, 6) : [];

  const pick = (m) => { onValueChange(`${m.name} — ${m.city}`); setOpen(false); setAddOpen(false); };
  const confirmAdd = () => {
    if (!value.trim() || !addCity.trim()) return;
    onAddCommunity(value.trim(), addCity.trim());
    onValueChange(`${value.trim()} — ${addCity.trim()}`);
    setAddOpen(false); setOpen(false);
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        style={inputStyleBase} value={value}
        onChange={(e) => { onValueChange(e.target.value); setOpen(true); setAddOpen(false); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => { if (!addOpenRef.current) setOpen(false); }, 150)}
        placeholder="Start typing a museum or city…"
      />
      {open && q && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: `1px solid ${T.hair}`, zIndex: 30, maxHeight: 220, overflowY: "auto" }}>
          {matches.map((m, i) => (
            <button key={i} onClick={() => pick(m)} className="f-body" style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", background: "none", border: "none", borderBottom: `1px solid ${T.hair}`, cursor: "pointer", fontSize: 12.5 }}>
              {m.name} <span style={{ color: T.muted }}>· {m.city}</span>
              {m.source === "community" && <span className="f-mono" style={{ marginLeft: 6, fontSize: 8.5, color: T.moss }}>COMMUNITY</span>}
            </button>
          ))}
          {matches.length === 0 && <div style={{ padding: "8px 10px", fontSize: 11.5, color: T.muted }}>No matches in the museum list yet.</div>}
          {!addOpen ? (
            <button onClick={() => setAddOpen(true)} className="f-mono" style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", background: T.paper, border: "none", cursor: "pointer", fontSize: 10.5, color: T.accent }}>
              + ADD "{value}" AS A NEW MUSEUM
            </button>
          ) : (
            <div style={{ padding: "8px 10px", display: "flex", gap: 6, background: T.paper }}>
              <input value={addCity} onChange={(e) => setAddCity(e.target.value)} placeholder="Which city?" style={{ ...inputStyleBase, fontSize: 12 }} />
              <button onClick={confirmAdd} className="f-mono" style={{ fontSize: 10, padding: "0 10px", background: T.moss, color: "#fff", border: "none", cursor: "pointer" }}>ADD</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================= guestbook notes (profiles + museums) ============================= */
function NotesPanel({ slug, label, placeholder }) {
  const [notes, setNotes] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { (async () => { try { setNotes(await api.getNotes(slug)); } catch (e) { setNotes([]); } })(); }, [slug]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const entry = { text: text.trim().slice(0, 280), at: Date.now() };
    try {
      await api.postNote(slug, entry.text);
      setNotes((prev) => [entry, ...(prev || [])].slice(0, 40));
      setText("");
    } catch (e) { console.error(e); }
    setBusy(false);
  };

  return (
    <div style={{ marginTop: 10, borderTop: `1px dashed ${T.hair}`, paddingTop: 10 }}>
      <div className="f-mono" style={{ fontSize: 9, color: T.muted, marginBottom: 6, letterSpacing: "0.04em" }}>{label || "PUBLIC NOTES — visible to anyone, like a museum guestbook"}</div>
      {notes === null ? <Spinner label="Loading notes…" /> : notes.length === 0 ? (
        <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 8 }}>No notes yet. Be the first to leave one.</div>
      ) : (
        <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
          {notes.slice(0, 5).map((n, i) => <div key={i} style={{ fontSize: 12, color: T.ink, background: "#fff", border: `1px solid ${T.hair}`, padding: "6px 8px" }}>{n.text}</div>)}
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder || "Leave a public note…"} style={{ ...inputStyleBase, fontSize: 12 }} maxLength={280} onKeyDown={(e) => e.key === "Enter" && send()} />
        <button onClick={send} disabled={busy || !text.trim()} className="f-mono" style={{ fontSize: 10, padding: "0 10px", background: T.horizon, color: "#fff", border: "none", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "…" : "SEND"}
        </button>
      </div>
    </div>
  );
}

function DiscoverCard({ d, onOpen }) {
  return (
    <div className="pat-card" onClick={onOpen} style={{ background: T.card, border: `1px solid ${T.hair}`, padding: "16px 16px", cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <Users size={14} color={T.moss} />
        <div className="f-display" style={{ fontSize: 16 }}>{d.name}</div>
      </div>
      {d.bio && <div className="f-body" style={{ fontSize: 12.5, color: T.muted, marginBottom: 10 }}>{d.bio}</div>}
      <div className="f-mono" style={{ fontSize: 9.5, color: T.horizon, letterSpacing: "0.04em" }}>VIEW GALLERY &amp; CANON →</div>
    </div>
  );
}

function ProfileLightbox({ handle, myCanonWorks, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [view, setView] = useState("canon");
  const [compareText, setCompareText] = useState(null);
  const [compareBusy, setCompareBusy] = useState(false);
  const slug = "profile-" + handle;

  useEffect(() => {
    api.getProfile(handle).then(setData).catch((e) => setError(e.message || "Couldn't load this profile."));
  }, [handle]);

  const runCompare = async () => {
    setCompareBusy(true);
    const text = await aiCompareCanons(myCanonWorks, data.canon);
    setCompareBusy(false);
    setCompareText(text || "Couldn't reach the AI just now — try again in a moment.");
  };

  return (
    <ModalShell title={data ? `${data.name}'s profile` : "Loading…"} onClose={onClose}>
      {error && <div style={{ color: T.seal, fontSize: 12.5 }}>{error}</div>}
      {!data && !error && <Spinner label="Loading profile…" />}
      {data && (
        <>
          {data.bio && <p className="f-body" style={{ fontSize: 13, color: T.muted, marginTop: -6, marginBottom: 12 }}>{data.bio}</p>}
          <div className="f-mono" style={{ fontSize: 10, color: T.muted, marginBottom: 14 }}>{data.visitCount} museum{data.visitCount === 1 ? "" : "s"} visited · {data.gallery.length} pieces · {data.canon.length} in canon</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button onClick={() => setView("canon")} className="f-mono" style={{ flex: 1, padding: "7px 0", fontSize: 10.5, border: `1px solid ${view === "canon" ? T.accent : T.hair}`, background: view === "canon" ? T.accent : "transparent", color: view === "canon" ? "#fff" : T.ink, cursor: "pointer" }}>CANON</button>
            <button onClick={() => setView("gallery")} className="f-mono" style={{ flex: 1, padding: "7px 0", fontSize: 10.5, border: `1px solid ${view === "gallery" ? T.accent : T.hair}`, background: view === "gallery" ? T.accent : "transparent", color: view === "gallery" ? "#fff" : T.ink, cursor: "pointer" }}>GALLERY</button>
          </div>
          {view === "canon" ? (
            data.canon.length === 0 ? <EmptyState text="Nothing in their canon yet." /> : (
              <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
                {data.canon.map((w, idx) => (
                  <div key={w.id} style={{ display: "flex", gap: 10, alignItems: "center", background: T.paper, padding: "8px 10px" }}>
                    <span className="f-display" style={{ fontSize: 16, color: T.seal, minWidth: 22 }}>{idx + 1}</span>
                    <div style={{ width: 44, height: 34, flexShrink: 0 }}><Frame palette={w.palette || paletteFor(w.id)} imageDataUrl={w.imageDataUrl} mine={w.mine} size="small" /></div>
                    <div>
                      <div className="f-body" style={{ fontSize: 13 }}>{w.title}</div>
                      <div className="f-mono" style={{ fontSize: 9.5, color: T.muted }}>{[w.mine ? "their photo" : w.artist, w.museum].filter(Boolean).join(" · ")}</div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            data.gallery.length === 0 ? <EmptyState text="Nothing in their gallery yet." /> : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px,1fr))", gap: 10, marginBottom: 16 }}>
                {data.gallery.map((w) => (
                  <div key={w.id}>
                    <Frame palette={w.palette || paletteFor(w.id)} imageDataUrl={w.imageDataUrl} mine={w.mine} size="small" />
                    <div className="f-mono" style={{ fontSize: 9, color: T.muted, marginTop: 3 }}>{w.title}</div>
                  </div>
                ))}
              </div>
            )
          )}
          {myCanonWorks.length > 0 && data.canon.length > 0 && (
            <button onClick={runCompare} disabled={compareBusy} className="f-mono" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: T.moss, background: "none", border: `1px solid ${T.moss}`, padding: "7px 11px", cursor: compareBusy ? "default" : "pointer", marginBottom: 10 }}>
              {compareBusy ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : "✦"} COMPARE OUR TASTE
            </button>
          )}
          {compareText && <div style={{ marginBottom: 14, fontSize: 12.5, color: T.ink, background: T.paper, border: `1px dashed ${T.hair}`, padding: "9px 11px" }}>{compareText}</div>}
          <NotesPanel slug={slug} label="LEAVE A NOTE — visible to anyone, like a guestbook" />
        </>
      )}
    </ModalShell>
  );
}

/* ============================= auth (register / sign in — a real account now) ============================= */
function Auth({ onDone }) {
  const [mode, setMode] = useState("register");
  const [accountType, setAccountType] = useState("personal");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [bio, setBio] = useState("");
  const [museumQuery, setMuseumQuery] = useState("");
  const [pickedMuseum, setPickedMuseum] = useState(null);
  const [communityMuseums, setCommunityMuseums] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (accountType === "museum" && communityMuseums.length === 0) {
      api.getCommunityMuseums().then(setCommunityMuseums).catch(() => {});
    }
  }, [accountType]);

  const combined = useMemo(() => mergeMuseumLists(communityMuseums), [communityMuseums]);
  const q = museumQuery.trim().toLowerCase();
  const matches = q ? combined.filter((m) => (m.name + " " + m.city).toLowerCase().includes(q)).slice(0, 6) : [];

  const submit = async () => {
    if (!name.trim() || !password) return;
    if (mode === "register" && accountType === "museum" && !pickedMuseum) { setError("Pick which museum you're claiming from the list."); return; }
    setSaving(true); setError("");
    const slug = pickedMuseum ? "museum-" + slugName(pickedMuseum.name + "-" + pickedMuseum.city) : null;
    try {
      const result = mode === "register" ? await api.register(name.trim(), password, bio.trim(), accountType, slug) : await api.login(name.trim(), password);
      setToken(result.token);
      onDone(result.user);
    } catch (e) {
      setError(e.message || "Something went wrong.");
    }
    setSaving(false);
  };

  return (
    <div className="f-body" style={{ minHeight: "100vh", background: T.paper, color: T.ink, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      {FONTS}
      <div style={{ maxWidth: 420, width: "100%" }}>
        <div className="pat-horizon" aria-hidden="true">
          <div className="pat-horizon-sky" />
          <div className="pat-horizon-hill pat-horizon-hill-far" />
          <div className="pat-horizon-hill pat-horizon-hill-near" />
          <div className="pat-horizon-boat" />
        </div>
        <div className="f-mono" style={{ fontSize: 10.5, color: T.accent, letterSpacing: "0.14em", marginBottom: 6 }}>AFTER THE PAINTER OF FAR HORIZONS</div>
        <h1 className="f-display" style={{ fontSize: 34, marginBottom: 8, fontStyle: "italic" }}>Patinir</h1>
        <p style={{ fontSize: 13.5, color: T.muted, marginBottom: 18, lineHeight: 1.5 }}>
          Log the museums and exhibits you visit, keep your own photos alongside the official record,
          and build a ranked canon of the pieces you'd defend.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button onClick={() => { setMode("register"); setError(""); }} className="f-mono" style={{ flex: 1, padding: "8px 0", fontSize: 11, letterSpacing: "0.05em", border: `1px solid ${mode === "register" ? T.accent : T.hair}`, background: mode === "register" ? T.accent : "transparent", color: mode === "register" ? "#fff" : T.ink, cursor: "pointer" }}>NEW ACCOUNT</button>
          <button onClick={() => { setMode("login"); setError(""); }} className="f-mono" style={{ flex: 1, padding: "8px 0", fontSize: 11, letterSpacing: "0.05em", border: `1px solid ${mode === "login" ? T.accent : T.hair}`, background: mode === "login" ? T.accent : "transparent", color: mode === "login" ? "#fff" : T.ink, cursor: "pointer" }}>SIGN IN</button>
        </div>
        {mode === "register" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button onClick={() => setAccountType("personal")} className="f-mono" style={{ flex: 1, padding: "7px 0", fontSize: 10.5, border: `1.5px solid ${accountType === "personal" ? T.moss : T.hair}`, background: "transparent", color: T.ink, cursor: "pointer" }}>A PERSON</button>
            <button onClick={() => setAccountType("museum")} className="f-mono" style={{ flex: 1, padding: "7px 0", fontSize: 10.5, border: `1.5px solid ${accountType === "museum" ? T.moss : T.hair}`, background: "transparent", color: T.ink, cursor: "pointer" }}>A MUSEUM, CLAIMING OUR PAGE</button>
          </div>
        )}
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label className="f-mono" style={{ fontSize: 10, color: T.muted }}>{accountType === "museum" ? "STAFF ACCOUNT NAME" : "YOUR NAME"}</label>
            <input style={inputStyleBase} value={name} onChange={(e) => setName(e.target.value)} placeholder={accountType === "museum" ? "e.g. Frick Wing Team" : "e.g. Priya"} />
          </div>
          <div>
            <label className="f-mono" style={{ fontSize: 10, color: T.muted }}>PASSWORD {mode === "register" && "(6+ CHARACTERS)"}</label>
            <input type="password" style={inputStyleBase} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>
          {mode === "register" && accountType === "personal" && (
            <div>
              <label className="f-mono" style={{ fontSize: 10, color: T.muted }}>ONE LINE ABOUT YOUR TASTE (OPTIONAL)</label>
              <input style={inputStyleBase} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="e.g. Drawn to quiet interiors and charcoal" />
            </div>
          )}
          {mode === "register" && accountType === "museum" && (
            <div>
              <label className="f-mono" style={{ fontSize: 10, color: T.muted }}>WHICH MUSEUM ARE YOU CLAIMING?</label>
              {pickedMuseum ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${T.moss}`, padding: "9px 11px" }}>
                  <span style={{ fontSize: 13 }}>{pickedMuseum.name} <span style={{ color: T.muted }}>· {pickedMuseum.city}</span></span>
                  <button onClick={() => setPickedMuseum(null)} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted }}><X size={14} /></button>
                </div>
              ) : (
                <div style={{ position: "relative" }}>
                  <input style={inputStyleBase} value={museumQuery} onChange={(e) => setMuseumQuery(e.target.value)} placeholder="Search by museum or city…" />
                  {matches.length > 0 && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: `1px solid ${T.hair}`, zIndex: 30, maxHeight: 180, overflowY: "auto" }}>
                      {matches.map((m, i) => (
                        <button key={i} onClick={() => { setPickedMuseum(m); setMuseumQuery(""); }} className="f-body" style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", background: "none", border: "none", borderBottom: `1px solid ${T.hair}`, cursor: "pointer", fontSize: 12.5 }}>
                          {m.name} <span style={{ color: T.muted }}>· {m.city}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="f-mono" style={{ fontSize: 9, color: T.muted, marginTop: 4 }}>Don't see it? Log a visit there as a person first (from the Museums tab) to add it, then come back and register as the museum.</div>
                </div>
              )}
            </div>
          )}
        </div>
        {error && <div style={{ color: T.seal, fontSize: 12, marginTop: 10 }}>{error}</div>}
        <button onClick={submit} disabled={!name.trim() || !password || saving} className="f-mono" style={{ marginTop: 18, width: "100%", padding: "11px 0", fontSize: 11.5, letterSpacing: "0.06em", background: name.trim() && password ? T.accent : T.hair, color: name.trim() && password ? "#fff" : T.muted, border: "none", cursor: name.trim() && password ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : mode === "register" ? "CREATE ACCOUNT" : "SIGN IN"}
        </button>
      </div>
    </div>
  );
}

/* ============================= main app ============================= */
function App() {
  const [phase, setPhase] = useState("loading"); // loading | auth | ready
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState("gallery");

  const [visits, setVisits] = useState([]);
  const [works, setWorks] = useState([]);
  const [canon, setCanon] = useState([]);
  const [communityMuseums, setCommunityMuseums] = useState([]);
  const [following, setFollowing] = useState(new Set());
  const toggleFollow = async (slug) => {
    const isFollowing = following.has(slug);
    setFollowing((prev) => { const next = new Set(prev); isFollowing ? next.delete(slug) : next.add(slug); return next; });
    try { isFollowing ? await api.unfollowMuseum(slug) : await api.followMuseum(slug); } catch (e) { console.error(e); }
  };

  const [feed, setFeed] = useState(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [reportedIds, setReportedIds] = useState(() => new Set());
  const [discover, setDiscover] = useState(null);
  const [discoverLoading, setDiscoverLoading] = useState(false);

  const [showLogForm, setShowLogForm] = useState(false);
  const [showWorkForm, setShowWorkForm] = useState(false);
  const [showReflect, setShowReflect] = useState(false);
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [editingWork, setEditingWork] = useState(null);
  const [openCanon, setOpenCanon] = useState(null);
  const [theme, setTheme] = useState("patinir");
  const [wallStyle, setWallStyle] = useState("plain");
  const [showThemePanel, setShowThemePanel] = useState(false);

  const changeTheme = async (name) => { setTheme(name); try { await api.savePrefs({ uiTheme: name }); } catch (e) {} };
  const changeWallStyle = async (name) => { setWallStyle(name); try { await api.savePrefs({ galleryWall: name }); } catch (e) {} };

  const loadEverything = useCallback(async () => {
    try {
      const data = await api.getMyData();
      setProfile(data.profile);
      setTab(data.profile.accountType === "museum" ? "mymuseum" : "gallery");
      setVisits(data.visits || []); setWorks(data.gallery || []); setCanon(data.canon || []);
      if (THEMES[data.uiTheme]) setTheme(data.uiTheme);
      if (WALL_STYLES[data.galleryWall]) setWallStyle(data.galleryWall);
      const cm = await api.getCommunityMuseums().catch(() => []);
      setCommunityMuseums(cm || []);
      const fw = await api.getFollowing().catch(() => []);
      setFollowing(new Set(fw || []));
      setPhase("ready");
    } catch (e) {
      setToken(null);
      setPhase("auth");
    }
  }, []);

  useEffect(() => {
    if (!authToken) { setPhase("auth"); return; }
    loadEverything();
  }, [loadEverything]);

  const loadFeed = useCallback(async () => { setFeedLoading(true); try { setFeed(await api.getFeed()); } catch (e) { setFeed([]); } setFeedLoading(false); }, []);
  const loadDiscover = useCallback(async () => { setDiscoverLoading(true); try { setDiscover(await api.getDiscover()); } catch (e) { setDiscover([]); } setDiscoverLoading(false); }, []);
  const [museumFeed, setMuseumFeed] = useState(null);
  const [museumFeedLoading, setMuseumFeedLoading] = useState(false);
  const loadMuseumFeed = useCallback(async () => { setMuseumFeedLoading(true); try { setMuseumFeed(await api.getMuseumFeed()); } catch (e) { setMuseumFeed([]); } setMuseumFeedLoading(false); }, []);
  const [myMuseumProfile, setMyMuseumProfile] = useState(null);
  const loadMyMuseumProfile = useCallback(async () => {
    if (!profile?.museumSlug) return;
    try { setMyMuseumProfile(await api.getMuseumProfile(profile.museumSlug)); } catch (e) { setMyMuseumProfile(null); }
  }, [profile]);

  useEffect(() => {
    if (phase !== "ready") return;
    if (tab === "feed" && feed === null) loadFeed();
    if (tab === "discover" && discover === null) loadDiscover();
    if (tab === "museumfeed" && museumFeed === null) loadMuseumFeed();
    if (tab === "mymuseum") loadMyMuseumProfile();
  }, [tab, phase, feed, discover, museumFeed, loadFeed, loadDiscover, loadMuseumFeed, loadMyMuseumProfile]);

  const workById = useMemo(() => Object.fromEntries(works.map((w) => [w.id, w])), [works]);

  const saveVisits = async (next) => { setVisits(next); try { await api.saveVisits(next); } catch (e) { console.error(e); } };
  const saveWorks = async (next) => { setWorks(next); try { await api.saveGallery(next); } catch (e) { console.error(e); } };
  const saveCanon = async (next) => { setCanon(next); try { await api.saveCanon(next); } catch (e) { console.error(e); } };

  const addCommunityMuseum = async (name, city) => {
    const entry = { name, city, added_by: profile?.name || "anon", created_at: Date.now() };
    setCommunityMuseums((prev) => [entry, ...prev]);
    try { await api.addCommunityMuseumApi(name, city); } catch (e) { console.error(e); }
  };

  const addVisit = async (v, shareToFeed) => {
    await saveVisits([v, ...visits]);
    if (shareToFeed) {
      try {
        await api.postFeed({ museum: v.museum, exhibit: v.exhibit, rating: v.rating, note: v.note, date: v.date });
        setFeed((prev) => prev === null ? null : [{ id: "local-" + v.id, author_name: profile.name, kind: "visit", museum: v.museum, exhibit: v.exhibit, rating: v.rating, note: v.note, date: v.date, report_count: 0 }, ...prev]);
      } catch (e) { console.error(e); }
    }
  };
  const addWork = async (w) => saveWorks([w, ...works]);
  const updateWork = async (updated) => { await saveWorks(works.map((w) => (w.id === updated.id ? updated : w))); setEditingWork(null); };
  const deleteWork = async (id) => {
    await saveWorks(works.filter((w) => w.id !== id));
    if (canon.includes(id)) await saveCanon(canon.filter((cid) => cid !== id));
    setEditingWork(null);
  };

  const toggleCanon = async (id) => { setPublished(false); await saveCanon(canon.includes(id) ? canon.filter((x) => x !== id) : [...canon, id]); };
  const moveCanon = async (id, dir) => {
    const i = canon.indexOf(id), j = i + dir;
    if (j < 0 || j >= canon.length) return;
    const copy = [...canon]; [copy[i], copy[j]] = [copy[j], copy[i]];
    setPublished(false); await saveCanon(copy);
  };
  const toggleProfileVisibility = async () => {
    setVisibilityBusy(true);
    const next = !profile.profilePublic;
    try {
      await api.setVisibility(next);
      setProfile((p) => ({ ...p, profilePublic: next }));
      setDiscover(null);
    } catch (e) { console.error(e); }
    setVisibilityBusy(false);
  };
  const reportFeedItem = async (id) => {
    if (reportedIds.has(id)) return;
    setReportedIds((prev) => new Set(prev).add(id));
    try { await api.reportFeed(id); } catch (e) { console.error(e); }
    setFeed((prev) => (prev || []).map((it) => (it.id === id ? { ...it, report_count: (it.report_count || 0) + 1 } : it)));
  };
  const resetMyData = async () => {
    if (!window.confirm("Clear everything you've logged? This only affects your own data.")) return;
    try { await api.resetMyData(); } catch (e) { console.error(e); }
    setVisits([]); setWorks([]); setCanon([]);
  };
  const signOut = () => { setToken(null); setProfile(null); setPhase("auth"); };

  const tasteInsight = useMemo(() => {
    const canonWorks = canon.map((id) => workById[id]).filter(Boolean);
    if (canonWorks.length === 0) return "Add a few pieces to your canon and this will build itself.";
    const mediums = canonWorks.map((w) => w.medium || "Unlabeled medium");
    const commonMedium = [...mediums].sort((a, b) => mediums.filter((x) => x === a).length - mediums.filter((x) => x === b).length).pop();
    const years = canonWorks.map((w) => Number(w.year)).filter((y) => !isNaN(y) && y > 0);
    const avgDecade = years.length ? Math.round(years.reduce((a, b) => a + b, 0) / years.length / 10) * 10 : null;
    return `Your canon leans toward ${commonMedium.toLowerCase()}${avgDecade ? `, centered around the ${avgDecade}s` : ""}. ${canonWorks.filter((w) => w.mine).length} of ${canonWorks.length} pieces are your own photographs.`;
  }, [canon, workById]);

  const myCanonWorks = useMemo(() => canon.map((id) => workById[id]).filter(Boolean), [canon, workById]);
  const myPalette = useMemo(() => myCanonWorks.map((w) => w.pickedColor || (w.colors && w.colors[0])).filter(Boolean), [myCanonWorks]);
  const tasteStats = useMemo(() => computeTasteStats(myCanonWorks), [myCanonWorks]);
  const canonSignature = useMemo(() => myCanonWorks.map((w) => w.id).join("|"), [myCanonWorks]);
  const [curatorNote, setCuratorNote] = useState(null);
  const [curatorLoading, setCuratorLoading] = useState(false);
  const [curatorSig, setCuratorSig] = useState(null);

  const generateCuratorNote = useCallback(async (force) => {
    if (myCanonWorks.length === 0) { setCuratorNote(null); setCuratorSig(null); return; }
    if (!force && curatorSig === canonSignature) return;
    setCuratorLoading(true);
    const text = await aiCuratorNote(myCanonWorks);
    setCuratorLoading(false);
    if (text) { setCuratorNote(text); setCuratorSig(canonSignature); }
  }, [myCanonWorks, canonSignature, curatorSig]);

  useEffect(() => {
    if (phase !== "ready") return;
    if (tab === "taste" && curatorSig !== canonSignature) generateCuratorNote(false);
  }, [tab, phase, canonSignature, curatorSig, generateCuratorNote]);

  const isMuseumAccount = profile?.accountType === "museum";
  const NAV = isMuseumAccount ? [
    { id: "mymuseum", label: "My Museum" }, { id: "museums", label: "Museums" },
    { id: "feed", label: "Feed" }, { id: "discover", label: "Discover" },
  ] : [
    { id: "gallery", label: "My Gallery" }, { id: "canon", label: "My Canon" },
    { id: "museums", label: "Museums" }, { id: "museumfeed", label: "Museum Feed" },
    { id: "feed", label: "Feed" }, { id: "discover", label: "Discover" }, { id: "taste", label: "Taste" },
  ];

  if (phase === "loading") return <div className="f-body" style={{ minHeight: "100vh", background: T.paper, display: "flex", alignItems: "center", justifyContent: "center" }}>{FONTS}<Spinner label="Opening the gallery…" /></div>;
  if (phase === "auth") return <Auth onDone={() => loadEverything()} />;

  const visibleFeed = (feed || []).filter((v) => (v.report_count || v.reportCount || 0) < 3);

  return (
    <div className="f-body" style={{ minHeight: "100vh", background: T.paper, color: T.ink }}>
      {FONTS}
      <style>{`:root { ${themeCSSVars(THEMES[theme])} }`}</style>
      <div style={{ borderBottom: `1px solid ${T.hair}`, background: T.paperAlpha, backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "16px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span className="f-display" style={{ fontSize: 22, fontWeight: 600, fontStyle: "italic" }}>Patinir</span>
              <span className="f-mono" style={{ fontSize: 10.5, color: T.muted }}>hi, {profile.name}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowThemePanel((s) => !s)} title="Customize appearance" className="f-mono" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6, background: showThemePanel ? T.accent : "transparent", color: showThemePanel ? "#fff" : T.ink, border: `1px solid ${showThemePanel ? T.accent : T.hair}`, padding: "8px 10px", cursor: "pointer" }}>
                <Palette size={13} />
              </button>
              {!isMuseumAccount && (
                <button onClick={() => setShowReflect(true)} className="f-mono" style={{ fontSize: 11, letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 6, background: T.horizon, color: "#fff", border: "none", padding: "8px 12px", cursor: "pointer" }}>
                  <Sparkles size={13} /> SEE A PIECE
                </button>
              )}
              {!isMuseumAccount && (
                <button onClick={() => setShowLogForm(true)} className="f-mono" style={{ fontSize: 11, letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 6, background: T.accent, color: "#fff", border: "none", padding: "8px 12px", cursor: "pointer" }}>
                  <Plus size={13} /> LOG A VISIT
                </button>
              )}
              <button onClick={signOut} title="Sign out" className="f-mono" style={{ fontSize: 11, display: "flex", alignItems: "center", background: "transparent", color: T.muted, border: `1px solid ${T.hair}`, padding: "8px 10px", cursor: "pointer" }}>
                <LogOut size={13} />
              </button>
            </div>
          </div>
          {showThemePanel && (
            <div className="pat-tab-fade" style={{ marginTop: 14, padding: "12px", background: T.card, border: `1px solid ${T.hair}`, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {Object.entries(THEMES).map(([key, t]) => (
                <button key={key} onClick={() => changeTheme(key)} className="pat-card" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: `1.5px solid ${theme === key ? T.accent : T.hair}`, background: "transparent", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ display: "flex", width: 22, height: 22, borderRadius: "50%", overflow: "hidden", border: `1px solid ${T.hair}`, flexShrink: 0 }}>
                    <span style={{ flex: 1, background: t.accent }} /><span style={{ flex: 1, background: t.moss }} /><span style={{ flex: 1, background: t.horizon }} />
                  </span>
                  <span>
                    <div className="f-body" style={{ fontSize: 12, color: T.ink }}>{t.label}{theme === key ? " ✓" : ""}</div>
                    <div className="f-mono" style={{ fontSize: 9, color: T.muted }}>{t.hint}</div>
                  </span>
                </button>
              ))}
              <div style={{ width: "100%", borderTop: `1px dashed ${T.hair}`, margin: "6px 0 2px" }} />
              <div className="f-mono" style={{ fontSize: 9, color: T.muted, width: "100%", marginBottom: 2 }}>YOUR GALLERY WALL (APPLIES TO GALLERY + CANON ONLY)</div>
              {Object.entries(WALL_STYLES).map(([key, w]) => (
                <button key={key} onClick={() => changeWallStyle(key)} className="pat-card" style={{ padding: "6px 10px", border: `1.5px solid ${wallStyle === key ? T.accent : T.hair}`, background: "transparent", cursor: "pointer", fontSize: 11, color: T.ink }}>
                  {w.label}{wallStyle === key ? " ✓" : ""}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 22, marginTop: 18, overflowX: "auto" }}>
            {NAV.map((n) => (
              <button key={n.id} onClick={() => setTab(n.id)} className="f-mono" style={{ background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap", fontSize: 11.5, letterSpacing: "0.06em", padding: "0 0 10px", color: tab === n.id ? T.ink : T.muted, borderBottom: tab === n.id ? `2px solid ${T.accent}` : "2px solid transparent" }}>
                {n.label.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", width: "100%" }}>
          <div style={{ flex: 1, height: 4, background: T.accentSoft }} />
          <div style={{ flex: 1, height: 4, background: T.moss }} />
          <div style={{ flex: 1, height: 4, background: T.horizon }} />
        </div>
      </div>

      <div key={tab} className="pat-tab-fade" style={{ maxWidth: 980, margin: "0 auto", padding: "30px 20px 80px", ...(["gallery", "canon"].includes(tab) ? (WALL_STYLES[wallStyle]?.style || {}) : {}) }}>

        {tab === "gallery" && (
          <>
            <SectionHeader eyebrow="YOUR WALL" title="My Gallery" blurb="Every piece and photo you've chosen to keep — official artworks and your own museum photography, side by side."
              right={<SmallButton onClick={() => setShowWorkForm(true)}><span style={{ display: "flex", alignItems: "center", gap: 5 }}><Plus size={12} /> ADD PIECE OR PHOTO</span></SmallButton>} />
            {works.length === 0 ? <EmptyState text="Nothing here yet. Add a piece you saw, or a photo you took, using the button above." /> : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                {works.map((w) => (
                  <AccessionCard key={w.id} work={w} canonRank={canon.includes(w.id) ? canon.indexOf(w.id) + 1 : null} onOpen={() => setLightbox(w)}
                    actions={<SmallButton active={canon.includes(w.id)} onClick={() => toggleCanon(w.id)}>{canon.includes(w.id) ? "IN CANON" : "ADD TO CANON"}</SmallButton>} />
                ))}
              </div>
            )}
            <div style={{ marginTop: 26, borderTop: `1px dashed ${T.hair}`, paddingTop: 14 }}>
              <div className="f-mono" style={{ fontSize: 10, color: T.muted }}>Most museums allow non-flash photos of their permanent collection for personal use — check signage for special exhibitions on loan.</div>
            </div>
          </>
        )}

        {tab === "canon" && (
          <>
            <SectionHeader eyebrow="RANKED, NOT LISTED" title="My Canon" blurb="The pieces you'd defend. Order matters — reorder to say which comes first."
              right={canon.length > 0 && (
                <div className="f-mono" style={{ fontSize: 10, color: T.muted }}>
                  {profile.profilePublic ? <span style={{ color: T.moss }}>● Visible on your public profile</span> : <span>Private — turn on in the Taste tab to let people see this</span>}
                </div>
              )} />
            {canon.length === 0 ? <EmptyState text={'Nothing in your canon yet. Go to My Gallery and mark a piece "add to canon."'} /> : (
              <div style={{ display: "grid", gap: 10 }}>
                {canon.map((id, i) => {
                  const w = workById[id]; if (!w) return null;
                  return (
                    <div key={id} style={{ display: "flex", alignItems: "center", gap: 14, background: T.card, border: `1px solid ${T.hair}`, padding: "10px 14px" }}>
                      <div className="f-display" style={{ fontSize: 22, color: T.seal, minWidth: 30 }}>{i + 1}</div>
                      <div style={{ width: 56, height: 42, flexShrink: 0 }}><Frame palette={w.palette || paletteFor(w.id)} imageDataUrl={w.imageDataUrl} mine={w.mine} size="small" /></div>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <div className="f-body" style={{ fontSize: 13.5 }}>{w.title}</div>
                        <div className="f-mono" style={{ fontSize: 10, color: T.muted }}>{[w.mine ? "you" : w.artist, w.museum].filter(Boolean).join(" · ")}</div>
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => moveCanon(id, -1)} style={{ border: `1px solid ${T.hair}`, background: "none", cursor: "pointer", padding: 4 }}><ChevronUp size={14} /></button>
                        <button onClick={() => moveCanon(id, 1)} style={{ border: `1px solid ${T.hair}`, background: "none", cursor: "pointer", padding: 4 }}><ChevronDown size={14} /></button>
                        <button onClick={() => toggleCanon(id)} style={{ border: `1px solid ${T.hair}`, background: "none", cursor: "pointer", padding: 4, color: T.seal }}><X size={14} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === "museums" && <MuseumsTab communityMuseums={communityMuseums} onAddCommunity={addCommunityMuseum} following={following} onToggleFollow={toggleFollow} />}

        {tab === "museumfeed" && (
          <>
            <SectionHeader eyebrow="ANNOUNCEMENTS" title="Museum Feed" blurb="Updates from museums you follow — new exhibits, hours, anything they choose to post. Follow a museum from the Museums tab." />
            {museumFeedLoading && museumFeed === null ? <Spinner label="Loading…" /> : !museumFeed || museumFeed.length === 0 ? (
              <EmptyState text="Nothing yet — follow a museum from the Museums tab to see their posts here." />
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {museumFeed.map((p) => (
                  <div key={p.id} className="pat-card" style={{ background: T.card, border: `1px solid ${T.hair}`, padding: "14px 16px" }}>
                    <div className="f-mono" style={{ fontSize: 10, color: T.accent, marginBottom: 5 }}>{p.museum_name}</div>
                    <p style={{ fontSize: 13.5, color: T.ink }}>{p.text}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "mymuseum" && (
          <MyMuseumTab profile={profile} data={myMuseumProfile} onPosted={loadMyMuseumProfile} />
        )}

        {tab === "feed" && (
          <>
            <SectionHeader eyebrow="LIVE, SHARED" title="Feed" blurb="Visits and pieces people choose to share — shared the moment they say yes, nothing automatic." />
            {feedLoading && feed === null ? <Spinner label="Loading the feed…" /> : visibleFeed.length === 0 ? (
              <EmptyState text="Nothing shared yet. Log a visit or add a piece and check 'share to feed' to be the first." />
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {visibleFeed.map((v) => (
                  <div key={v.id} style={{ background: T.card, border: `1px solid ${T.hair}`, padding: "16px 18px", display: "flex", gap: 16, flexWrap: "wrap", position: "relative" }}>
                    <button onClick={() => reportFeedItem(v.id)} disabled={reportedIds.has(v.id)} title="Report this post" style={{ position: "absolute", top: 10, right: 10, background: "none", border: "none", cursor: reportedIds.has(v.id) ? "default" : "pointer", color: reportedIds.has(v.id) ? T.seal : T.hair }}>
                      <Flag size={13} />
                    </button>
                    {v.kind === "piece" ? (
                      <>
                        {(v.image_data_url || v.imageDataUrl) && (
                          <div style={{ flex: "0 0 90px", height: 90, overflow: "hidden", border: `1px solid ${T.hair}` }}>
                            <img src={v.image_data_url || v.imageDataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div className="f-mono" style={{ fontSize: 9, color: T.horizon, marginBottom: 3, letterSpacing: "0.05em" }}>ADDED TO A GALLERY</div>
                          <div className="f-display" style={{ fontSize: 16 }}>{v.title}</div>
                          <div className="f-mono" style={{ fontSize: 10.5, color: T.accent, margin: "3px 0 6px" }}>
                            {v.artist || v.medium || ""}{v.subject ? ` · ${v.subject}` : ""} · <span style={{ color: T.muted }}>by {v.author_name || v.authorName}</span>
                          </div>
                          {v.museum && <div className="f-mono" style={{ fontSize: 10, color: T.muted, display: "flex", alignItems: "center", gap: 4 }}><MapPin size={10} /> {v.museum}</div>}
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ flex: "0 0 100px" }}>
                          <div className="f-mono" style={{ fontSize: 10, color: T.muted }}>{v.date}</div>
                          <Stars value={v.rating} />
                        </div>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div className="f-display" style={{ fontSize: 16 }}>{v.museum}</div>
                          <div className="f-mono" style={{ fontSize: 10.5, color: T.accent, margin: "3px 0 6px" }}>{v.exhibit} · <span style={{ color: T.muted }}>by {v.author_name || v.authorName}</span></div>
                          {v.note && <p style={{ fontSize: 13, opacity: 0.85 }}>{v.note}</p>}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "discover" && (
          <>
            <SectionHeader eyebrow="REAL PROFILES, LIVE" title="Discover" blurb="Anyone with a public profile shows up here — click in to see their actual gallery and canon, not a snapshot. Turn yours on from the Taste tab." />
            {discoverLoading && discover === null ? <Spinner label="Loading canons…" /> : !discover || discover.length === 0 ? (
              <EmptyState text="No one's made their profile public yet. Turn yours on in the Taste tab." />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
                {discover.map((d) => <DiscoverCard key={d.handle} d={d} onOpen={() => setOpenCanon(d)} />)}
              </div>
            )}
          </>
        )}

        {tab === "taste" && (
          <>
            <SectionHeader eyebrow="AN IDENTITY, LIKE ANY OTHER" title="Your taste" />
            {myCanonWorks.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <div className="f-mono" style={{ fontSize: 9, color: T.muted, marginBottom: 8, letterSpacing: "0.05em" }}>YOUR CANON, BY THE NUMBERS</div>
                {(tasteStats.topSubject || tasteStats.topEra || tasteStats.topTrigger || tasteStats.topScale) ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12 }}>
                    {tasteStats.topSubject && <WrappedTile label="TOP SUBJECT" value={tasteStats.topSubject.value} sub={`${tasteStats.topSubject.count} of ${tasteStats.topSubject.total} tagged pieces`} color={T.moss} />}
                    {tasteStats.topEra && <WrappedTile label="YOUR ERA" value={tasteStats.topEra.value} sub={`${tasteStats.topEra.count} of ${tasteStats.topEra.total} dated pieces`} color={T.accent} />}
                    {tasteStats.topTrigger && <WrappedTile label="WHAT PULLS YOU IN" value={tasteStats.topTrigger.value} sub={`${tasteStats.topTrigger.count} of ${tasteStats.topTrigger.total} tagged pieces`} color={T.horizon} />}
                    {tasteStats.topScale && <WrappedTile label="YOUR SCALE" value={tasteStats.topScale.value} sub={`${tasteStats.topScale.count} of ${tasteStats.topScale.total} tagged pieces`} color={T.seal} />}
                  </div>
                ) : (
                  <div className="f-mono" style={{ fontSize: 10, color: T.muted }}>Tag subject, trigger, and scale on a few pieces (in Edit) and real numbers show up here.</div>
                )}
              </div>
            )}
            {myPalette.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div className="f-mono" style={{ fontSize: 9, color: T.muted, marginBottom: 6, letterSpacing: "0.05em" }}>YOUR PALETTE, ACROSS YOUR CANON</div>
                <div style={{ display: "flex", height: 22, border: `1px solid ${T.hair}`, overflow: "hidden" }}>
                  {myPalette.map((c, i) => <div key={i} style={{ flex: 1, background: c }} />)}
                </div>
              </div>
            )}
            <div style={{ background: T.card, border: `1px solid ${T.hair}`, padding: "22px 24px", marginBottom: 22 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <Sparkles size={16} color={T.moss} style={{ marginTop: 3, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div className="f-mono" style={{ fontSize: 9, color: T.horizon, marginBottom: 6, letterSpacing: "0.05em" }}>
                    {curatorNote ? "AI CURATOR'S NOTE" : "QUICK PATTERN"}
                  </div>
                  <p className="f-body" style={{ fontSize: 14, lineHeight: 1.6 }}>
                    {curatorLoading && !curatorNote ? "Reading your canon…" : (curatorNote || tasteInsight)}
                  </p>
                  {canon.length > 0 && (
                    <button onClick={() => generateCuratorNote(true)} disabled={curatorLoading} className="f-mono" style={{ marginTop: 10, fontSize: 9.5, color: T.accent, background: "none", border: "none", cursor: curatorLoading ? "default" : "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
                      {curatorLoading ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : "✦"} NEW REFLECTION
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 14 }}>
              <Stat label="Museums visited" value={new Set(visits.map((v) => v.museum)).size} />
              <Stat label="Pieces on your wall" value={works.length} />
              <Stat label="In your canon" value={canon.length} />
              <Stat label="Photos you've taken" value={works.filter((w) => w.mine).length} />
            </div>
            <div style={{ marginTop: 30, borderTop: `1px solid ${T.hair}`, paddingTop: 16 }}>
              <p className="f-body" style={{ fontSize: 12, color: T.muted, lineHeight: 1.6, marginBottom: 14 }}>
                Named for Joachim Patinir, the Flemish painter often credited as the first to make landscape itself
                the subject of a painting rather than a backdrop for figures — Dürer called him "the good landscape
                painter."
              </p>
              <div style={{ background: T.paper, border: `1px solid ${T.hair}`, padding: "14px 16px", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
                  <div className="f-mono" style={{ fontSize: 11, color: T.ink, letterSpacing: "0.03em" }}>MAKE MY PROFILE PUBLIC</div>
                  <button onClick={toggleProfileVisibility} disabled={visibilityBusy} className="f-mono" style={{ fontSize: 10.5, padding: "6px 12px", border: `1px solid ${profile.profilePublic ? T.moss : T.hair}`, background: profile.profilePublic ? T.moss : "transparent", color: profile.profilePublic ? "#fff" : T.ink, cursor: visibilityBusy ? "default" : "pointer" }}>
                    {visibilityBusy ? "…" : profile.profilePublic ? "ON — ANYONE CAN VIEW IT" : "OFF — PRIVATE"}
                  </button>
                </div>
                <p className="f-body" style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
                  When on, anyone can find you in Discover and see your <strong>Gallery</strong> (with your real photos) and your ranked <strong>Canon</strong> — live, not a snapshot, so it's always current. <strong>What this means to you</strong> and your reflection notes never show, on or off, no matter what — those stay yours regardless of this setting.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div className="f-mono" style={{ fontSize: 10.5, color: T.muted }}>Signed in as {profile.name}.</div>
                <button onClick={resetMyData} className="f-mono" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: T.seal, background: "none", border: `1px solid ${T.seal}`, padding: "6px 10px", cursor: "pointer" }}>
                  <RotateCcw size={11} /> RESET MY DATA
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {showLogForm && <LogVisitModal communityMuseums={communityMuseums} onAddCommunity={addCommunityMuseum} onClose={() => setShowLogForm(false)} onSave={async (v, share) => { await addVisit(v, share); setShowLogForm(false); }} />}
      {showWorkForm && <AddWorkModal communityMuseums={communityMuseums} onAddCommunity={addCommunityMuseum} onClose={() => setShowWorkForm(false)} onSave={async (w) => { await addWork(w); setShowWorkForm(false); }} />}
      {lightbox && <Lightbox work={lightbox} onClose={() => setLightbox(null)} onEdit={(w) => { setLightbox(null); setEditingWork(w); }} />}
      {editingWork && <EditWorkModal work={editingWork} onClose={() => setEditingWork(null)} onSave={updateWork} onDelete={deleteWork} communityMuseums={communityMuseums} onAddCommunity={addCommunityMuseum} />}
      {showReflect && <ReflectModal onClose={() => setShowReflect(false)} onSaveToGallery={addWork} />}
      {openCanon && <ProfileLightbox handle={openCanon.handle} myCanonWorks={myCanonWorks} onClose={() => setOpenCanon(null)} />}
    </div>
  );
}

/* ============================= plan a visit / museums tab ============================= */
function PlanVisit({ combined }) {
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");

  const run = async () => {
    if (!city.trim()) return;
    setBusy(true); setError(""); setPlan(null);
    const known = combined.filter((m) => m.city.toLowerCase() === city.trim().toLowerCase()).map((m) => m.name);
    const result = await aiPlanVisit(city.trim(), known);
    setBusy(false);
    if (!result || !result.museums) { setError("Couldn't build a plan just now — try again in a moment."); return; }
    if (result.museums.length === 0) { setError(`Nothing confident to suggest for "${city}" yet — try a nearby larger city, or check the Museums list below.`); return; }
    setPlan(result);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="e.g. Lisbon, Kyoto, Marrakesh…" style={{ ...inputStyleBase, flex: 1, minWidth: 200 }} />
        <button onClick={run} disabled={busy || !city.trim()} className="f-mono" style={{ fontSize: 11, letterSpacing: "0.05em", padding: "0 16px", background: city.trim() ? T.accent : T.hair, color: city.trim() ? "#fff" : T.muted, border: "none", cursor: city.trim() ? "pointer" : "default", display: "flex", alignItems: "center", gap: 6 }}>
          {busy ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : "✦"} PLAN MY VISIT
        </button>
      </div>
      {error && <div style={{ marginTop: 10, fontSize: 12.5, color: T.muted }}>{error}</div>}
      {plan && (
        <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
          {plan.museums.map((m, i) => (
            <div key={i} className="pat-card" style={{ background: T.card, border: `1px solid ${T.hair}`, padding: "14px 16px" }}>
              <div className="f-display" style={{ fontSize: 17 }}>{m.name}</div>
              {m.why && <div className="f-body" style={{ fontSize: 12.5, color: T.muted, marginTop: 2, marginBottom: 10 }}>{m.why}</div>}
              <div style={{ display: "grid", gap: 5 }}>
                {(m.mustSees || []).map((ms, idx) => (
                  <div key={idx} className="f-mono" style={{ fontSize: 10.5, color: T.ink, display: "flex", gap: 6 }}>
                    <span style={{ color: T.seal }}>✦</span>
                    <span>{ms.work}{ms.artist ? ` — ${ms.artist}` : ""}{ms.note ? <span style={{ color: T.muted }}> ({ms.note})</span> : null}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="f-mono" style={{ fontSize: 9.5, color: T.muted }}>AI-generated from general knowledge, not a live feed — confirm hours, tickets, and what's actually on view before you go.</div>
        </div>
      )}
    </div>
  );
}

function MuseumRow({ m, museumAccounts, following, onToggleFollow }) {
  const [open, setOpen] = useState(false);
  const [official, setOfficial] = useState(null);
  const mustSees = MUST_SEES[m.name] || [];
  const slug = "museum-" + slugName(m.name + "-" + m.city);
  const claimedAccount = museumAccounts.find((a) => a.museum_slug === slug);
  const isFollowing = following.has(slug);

  useEffect(() => {
    if (open && claimedAccount && !official) {
      api.getMuseumProfile(slug).then(setOfficial).catch(() => {});
    }
  }, [open, claimedAccount, slug, official]);

  const picksToShow = official?.picks?.length ? official.picks : mustSees;

  return (
    <div className="pat-card" style={{ background: T.card, border: `1px solid ${T.hair}`, padding: "9px 12px" }}>
      <button onClick={() => setOpen((o) => !o)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div className="f-body" style={{ fontSize: 13 }}>{m.name}</div>
            {claimedAccount && <span className="f-mono" style={{ fontSize: 8, color: T.accent, border: `1px solid ${T.accent}`, padding: "1px 5px" }}>OFFICIAL</span>}
          </div>
          <div className="f-mono" style={{ fontSize: 10, color: T.muted, display: "flex", alignItems: "center", gap: 4 }}><MapPin size={10} /> {m.city}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {m.source === "community" && <span className="f-mono" style={{ fontSize: 8.5, color: T.moss }}>COMMUNITY</span>}
          {open ? <ChevronUp size={13} color={T.muted} /> : <ChevronDown size={13} color={T.muted} />}
        </div>
      </button>
      {open && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${T.hair}` }}>
          {claimedAccount && (
            <button onClick={() => onToggleFollow(slug)} className="f-mono" style={{ fontSize: 10, padding: "5px 10px", marginBottom: 10, border: `1px solid ${isFollowing ? T.accent : T.hair}`, background: isFollowing ? T.accent : "transparent", color: isFollowing ? "#fff" : T.ink, cursor: "pointer" }}>
              {isFollowing ? "FOLLOWING" : "FOLLOW"}
            </button>
          )}
          {official?.posts?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div className="f-mono" style={{ fontSize: 9, color: T.accent, marginBottom: 5 }}>FROM THE MUSEUM</div>
              <div style={{ display: "grid", gap: 5 }}>
                {official.posts.slice(0, 3).map((p) => <div key={p.id} style={{ fontSize: 12, color: T.ink, background: T.paper, padding: "6px 8px" }}>{p.text}</div>)}
              </div>
            </div>
          )}
          {picksToShow.length > 0 && (
            <div style={{ display: "grid", gap: 4, marginBottom: 10 }}>
              <div className="f-mono" style={{ fontSize: 9, color: T.muted }}>{official?.picks?.length ? "OFFICIAL PICKS" : "MUST-SEES"}</div>
              {picksToShow.map((ms, idx) => (
                <div key={idx} className="f-mono" style={{ fontSize: 10.5, color: T.ink }}>
                  <span style={{ color: T.seal }}>✦</span> {ms.work} <span style={{ color: T.muted }}>— {ms.artist}</span>
                </div>
              ))}
            </div>
          )}
          <NotesPanel slug={slug} label="LOCALS & VISITORS RECOMMEND — tips from people who've actually been" placeholder="e.g. go weekday mornings, the top floor gets busy…" />
        </div>
      )}
    </div>
  );
}

function MyMuseumTab({ profile, data, onPosted }) {
  const [postText, setPostText] = useState("");
  const [posting, setPosting] = useState(false);
  const [pickWork, setPickWork] = useState("");
  const [pickArtist, setPickArtist] = useState("");
  const [pickNote, setPickNote] = useState("");
  const [pickBusy, setPickBusy] = useState(false);

  const submitPost = async () => {
    if (!postText.trim()) return;
    setPosting(true);
    try { await api.postMuseumPost(profile.museumSlug, postText.trim()); setPostText(""); onPosted(); } catch (e) { console.error(e); }
    setPosting(false);
  };
  const submitPick = async () => {
    if (!pickWork.trim()) return;
    setPickBusy(true);
    try { await api.postMuseumPick(profile.museumSlug, pickWork.trim(), pickArtist.trim(), pickNote.trim()); setPickWork(""); setPickArtist(""); setPickNote(""); onPosted(); } catch (e) { console.error(e); }
    setPickBusy(false);
  };

  return (
    <>
      <SectionHeader eyebrow="OFFICIAL ACCOUNT" title="My Museum" blurb={`Managing ${profile.name}. Posts and picks here show up publicly on your museum's entry to everyone, including people who haven't followed you yet.`} />
      <div style={{ marginBottom: 30 }}>
        <div className="f-mono" style={{ fontSize: 10.5, color: T.accent, letterSpacing: "0.1em", marginBottom: 10 }}>POST AN UPDATE</div>
        <textarea value={postText} onChange={(e) => setPostText(e.target.value)} placeholder="New exhibit, extended hours, anything worth telling followers…" maxLength={500} style={{ ...inputStyleBase, minHeight: 80, marginBottom: 8 }} />
        <button onClick={submitPost} disabled={!postText.trim() || posting} className="f-mono" style={{ fontSize: 11, letterSpacing: "0.05em", padding: "9px 16px", background: postText.trim() ? T.accent : T.hair, color: postText.trim() ? "#fff" : T.muted, border: "none", cursor: postText.trim() ? "pointer" : "default" }}>
          {posting ? "…" : "POST"}
        </button>
      </div>
      <div style={{ marginBottom: 30, borderTop: `1px dashed ${T.hair}`, paddingTop: 24 }}>
        <div className="f-mono" style={{ fontSize: 10.5, color: T.moss, letterSpacing: "0.1em", marginBottom: 10 }}>ADD AN OFFICIAL PICK</div>
        <div style={{ display: "grid", gap: 8, marginBottom: 8 }}>
          <input value={pickWork} onChange={(e) => setPickWork(e.target.value)} placeholder="Work title" style={inputStyleBase} />
          <input value={pickArtist} onChange={(e) => setPickArtist(e.target.value)} placeholder="Artist" style={inputStyleBase} />
          <input value={pickNote} onChange={(e) => setPickNote(e.target.value)} placeholder="Note — which gallery/floor, why it matters" style={inputStyleBase} />
        </div>
        <button onClick={submitPick} disabled={!pickWork.trim() || pickBusy} className="f-mono" style={{ fontSize: 11, letterSpacing: "0.05em", padding: "9px 16px", background: pickWork.trim() ? T.moss : T.hair, color: "#fff", border: "none", cursor: pickWork.trim() ? "pointer" : "default" }}>
          {pickBusy ? "…" : "ADD PICK"}
        </button>
      </div>
      <div style={{ borderTop: `1px dashed ${T.hair}`, paddingTop: 20 }}>
        <div className="f-mono" style={{ fontSize: 10.5, color: T.muted, letterSpacing: "0.1em", marginBottom: 14 }}>{data?.followerCount ?? 0} FOLLOWER{data?.followerCount === 1 ? "" : "S"}</div>
        {data?.posts?.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <div className="f-mono" style={{ fontSize: 9, color: T.muted, marginBottom: 6 }}>YOUR RECENT POSTS</div>
            <div style={{ display: "grid", gap: 8 }}>
              {data.posts.map((p) => <div key={p.id} style={{ fontSize: 13, background: T.card, border: `1px solid ${T.hair}`, padding: "8px 10px" }}>{p.text}</div>)}
            </div>
          </div>
        )}
        {data?.picks?.length > 0 && (
          <div>
            <div className="f-mono" style={{ fontSize: 9, color: T.muted, marginBottom: 6 }}>YOUR OFFICIAL PICKS</div>
            <div style={{ display: "grid", gap: 5 }}>
              {data.picks.map((p) => <div key={p.id} className="f-mono" style={{ fontSize: 10.5, color: T.ink }}><span style={{ color: T.seal }}>✦</span> {p.work} — {p.artist}{p.note ? ` (${p.note})` : ""}</div>)}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function MuseumsTab({ communityMuseums, onAddCommunity, following, onToggleFollow }) {
  const [query, setQuery] = useState("");
  const [museumAccounts, setMuseumAccounts] = useState([]);
  useEffect(() => { api.getMuseumAccounts().then(setMuseumAccounts).catch(() => {}); }, []);
  const combined = useMemo(() => mergeMuseumLists(communityMuseums), [communityMuseums]);
  const cities = useMemo(() => Array.from(new Set(combined.map((c) => c.city))).sort(), [combined]);
  const q = query.trim().toLowerCase();
  const results = q ? combined.filter((m) => (m.name + " " + m.city).toLowerCase().includes(q)).slice(0, 60) : [];

  return (
    <>
      <SectionHeader eyebrow="ANY CITY, A REAL PLAN" title="Plan a Visit" blurb="Type a city — anywhere — and get museums worth going to and the pieces worth seeking out inside them." />
      <PlanVisit combined={combined} />

      <div style={{ marginTop: 34, marginBottom: 22, borderTop: `1px solid ${T.hair}`, paddingTop: 22 }}>
        <SectionHeader eyebrow="CURATED + LOCALLY ADDED" title="Browse Museums" blurb="Tap any museum to see must-sees, official updates if it's claimed, and to leave a tip for other travelers. Can't find yours? Add it from the log-a-visit form." />
      </div>
      <div style={{ position: "relative", marginBottom: 18, display: "flex", alignItems: "center" }}>
        <Search size={14} color={T.muted} style={{ position: "absolute", left: 10 }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by museum or city…" style={{ ...inputStyleBase, paddingLeft: 32 }} />
      </div>
      {!q ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {cities.map((c) => <button key={c} onClick={() => setQuery(c)} className="f-mono" style={{ fontSize: 10.5, padding: "6px 10px", border: `1px solid ${T.hair}`, background: T.card, cursor: "pointer", color: T.ink }}>{c}</button>)}
        </div>
      ) : results.length === 0 ? (
        <EmptyState text="No matches yet — this list only has what's curated or community-added so far." />
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {results.map((m, i) => <MuseumRow key={i} m={m} museumAccounts={museumAccounts} following={following} onToggleFollow={onToggleFollow} />)}
        </div>
      )}
    </>
  );
}

/* ============================= modals ============================= */
function Lightbox({ work, onClose, onEdit }) {
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePhoto, setSharePhoto] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shared, setShared] = useState(false);

  const doShare = async () => {
    setShareBusy(true);
    try {
      await api.postFeed({ kind: "piece", title: work.title, artist: work.artist, medium: work.medium, subject: work.subject, museum: work.museum, imageDataUrl: sharePhoto ? work.imageDataUrl : null });
      setShared(true); setShareOpen(false);
    } catch (e) { console.error(e); }
    setShareBusy(false);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,18,15,0.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 60, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="pat-modal-in" style={{ background: T.card, border: `1px solid ${T.hair}`, boxShadow: "0 30px 80px rgba(0,0,0,0.4)", maxWidth: 560, width: "100%", margin: "auto" }}>
        <div style={{ position: "relative" }}>
          <Frame palette={work.palette || paletteFor(work.id)} imageDataUrl={work.imageDataUrl} mine={work.mine} size="large" />
          <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 6 }}>
            <button onClick={() => onEdit(work)} className="f-mono" style={{ background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", cursor: "pointer", padding: "6px 10px", fontSize: 10, display: "flex", alignItems: "center", gap: 5 }}>EDIT</button>
            <button onClick={onClose} style={{ background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", cursor: "pointer", padding: 6 }}><X size={16} /></button>
          </div>
        </div>
        <div style={{ padding: "18px 20px 20px" }}>
          <div className="f-mono" style={{ fontSize: 10, color: T.muted, marginBottom: 5 }}>{[work.acc, work.medium].filter(Boolean).join(" · ")}</div>
          <div className="f-display" style={{ fontSize: 22, color: T.ink, marginBottom: 4 }}>{work.title}</div>
          <div className="f-body" style={{ fontSize: 14, color: T.muted, marginBottom: 8 }}>{[work.mine ? "Taken by you" : work.artist, work.year].filter(Boolean).join(" · ")}</div>
          {work.museum && <div className="f-body" style={{ fontSize: 12.5, color: T.muted, display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}><MapPin size={12} /> {work.museum}</div>}
          {(work.emotion || work.pickedColor) && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6 }}>
              {work.pickedColor && <span style={{ width: 14, height: 14, borderRadius: "50%", background: work.pickedColor, border: `1px solid ${T.hair}` }} />}
              {work.emotion && <span className="f-mono" style={{ fontSize: 11, color: T.muted }}>{work.emotion}</span>}
            </div>
          )}
          {work.personalMeaning && (
            <div style={{ marginTop: 12, borderTop: `1px dashed ${T.hair}`, paddingTop: 10 }}>
              <div className="f-mono" style={{ fontSize: 9, color: T.accent, marginBottom: 6 }}>WHAT THIS MEANS TO YOU</div>
              <p style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{work.personalMeaning}</p>
            </div>
          )}
          {work.reflectionNotes && work.reflectionNotes.length > 0 && (
            <div style={{ marginTop: 12, borderTop: `1px dashed ${T.hair}`, paddingTop: 10 }}>
              <div className="f-mono" style={{ fontSize: 9, color: T.horizon, marginBottom: 6 }}>WHAT YOU NOTICED</div>
              <div style={{ display: "grid", gap: 6 }}>
                {work.reflectionNotes.map((n, i) => <div key={i} style={{ fontSize: 13, color: T.ink, background: T.paper, padding: "7px 9px" }}>{n}</div>)}
              </div>
            </div>
          )}
          <div style={{ marginTop: 14, borderTop: `1px dashed ${T.hair}`, paddingTop: 12 }}>
            {shared ? (
              <div className="f-mono" style={{ fontSize: 10.5, color: T.moss }}>✓ SHARED TO THE FEED</div>
            ) : !shareOpen ? (
              <button onClick={() => setShareOpen(true)} className="f-mono" style={{ fontSize: 10.5, color: T.horizon, background: "none", border: `1px solid ${T.horizon}`, padding: "6px 11px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                <Share2 size={11} /> SHARE TO FEED
              </button>
            ) : (
              <div>
                {work.imageDataUrl && (
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: T.muted, cursor: "pointer", marginBottom: 8 }}>
                    <input type="checkbox" checked={sharePhoto} onChange={(e) => setSharePhoto(e.target.checked)} /> Also share the photo — no automated review on shared photos yet
                  </label>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={doShare} disabled={shareBusy} className="f-mono" style={{ fontSize: 10.5, color: "#fff", background: T.horizon, border: "none", padding: "6px 11px", cursor: shareBusy ? "default" : "pointer" }}>{shareBusy ? "…" : "CONFIRM SHARE"}</button>
                  <button onClick={() => setShareOpen(false)} className="f-mono" style={{ fontSize: 10.5, color: T.muted, background: "none", border: `1px solid ${T.hair}`, padding: "6px 11px", cursor: "pointer" }}>CANCEL</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EditWorkModal({ work, onClose, onSave, onDelete, communityMuseums, onAddCommunity }) {
  const [title, setTitle] = useState(work.title || "");
  const [artist, setArtist] = useState(work.artist || "");
  const [year, setYear] = useState(work.year || "");
  const [medium, setMedium] = useState(work.medium || "");
  const [museum, setMuseum] = useState(work.museum || "");
  const [emotion, setEmotion] = useState(work.emotion || "");
  const [pickedColor, setPickedColor] = useState(work.pickedColor || null);
  const [personalMeaning, setPersonalMeaning] = useState(work.personalMeaning || "");
  const [subject, setSubject] = useState(work.subject || "");
  const [trigger, setTrigger] = useState(work.trigger || "");
  const [scale, setScale] = useState(work.scale || "");
  const [saving, setSaving] = useState(false);
  const colors = work.colors && work.colors.length ? work.colors : (work.pickedColor ? [work.pickedColor] : []);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({ ...work, title: title.trim(), artist: artist.trim(), year: year.trim(), medium: medium.trim(), museum: museum.trim(), emotion: emotion || null, pickedColor: pickedColor || null, personalMeaning: personalMeaning.trim() || null, subject: subject || null, trigger: trigger || null, scale: scale || null });
    setSaving(false);
  };

  return (
    <ModalShell title="Edit this piece" onClose={onClose}>
      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <label className="f-mono" style={{ fontSize: 10, color: T.muted }}>TITLE</label>
          <input style={inputStyleBase} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        {!work.mine && (
          <div>
            <label className="f-mono" style={{ fontSize: 10, color: T.muted }}>ARTIST</label>
            <input style={inputStyleBase} value={artist} onChange={(e) => setArtist(e.target.value)} />
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label className="f-mono" style={{ fontSize: 10, color: T.muted }}>YEAR</label>
            <input style={inputStyleBase} value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <div>
            <label className="f-mono" style={{ fontSize: 10, color: T.muted }}>MEDIUM</label>
            <input style={inputStyleBase} value={medium} onChange={(e) => setMedium(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="f-mono" style={{ fontSize: 10, color: T.muted }}>MUSEUM</label>
          <MuseumPicker value={museum} onValueChange={setMuseum} communityMuseums={communityMuseums} onAddCommunity={onAddCommunity} />
        </div>
        {colors.length > 0 && (
          <div>
            <div className="f-mono" style={{ fontSize: 9, color: T.muted, marginBottom: 5 }}>WHICH COLOR PULLED YOU IN?</div>
            <div style={{ display: "flex", gap: 7 }}>
              {colors.map((c) => (
                <button key={c} onClick={() => setPickedColor(pickedColor === c ? null : c)} title={c} style={{ width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer", border: pickedColor === c ? `2px solid ${T.ink}` : `1px solid ${T.hair}` }} />
              ))}
            </div>
          </div>
        )}
        <div>
          <div className="f-mono" style={{ fontSize: 9, color: T.muted, marginBottom: 5 }}>HOW DID IT MAKE YOU FEEL?</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {EMOTIONS.map((em) => (
              <button key={em} onClick={() => setEmotion(emotion === em ? "" : em)} className="f-mono" style={{ fontSize: 10, padding: "4px 9px", border: `1px solid ${emotion === em ? T.accent : T.hair}`, background: emotion === em ? T.accent : "transparent", color: emotion === em ? "#fff" : T.ink, cursor: "pointer" }}>{em}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="f-mono" style={{ fontSize: 9, color: T.muted, marginBottom: 5 }}>WHAT KIND OF SUBJECT IS IT?</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SUBJECTS.map((s) => (
              <button key={s} onClick={() => setSubject(subject === s ? "" : s)} className="f-mono" style={{ fontSize: 10, padding: "4px 9px", border: `1px solid ${subject === s ? T.moss : T.hair}`, background: subject === s ? T.moss : "transparent", color: subject === s ? "#fff" : T.ink, cursor: "pointer" }}>{s}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="f-mono" style={{ fontSize: 9, color: T.muted, marginBottom: 5 }}>WHAT PULLED YOU IN FIRST?</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TRIGGERS.map((t) => (
              <button key={t} onClick={() => setTrigger(trigger === t ? "" : t)} className="f-mono" style={{ fontSize: 10, padding: "4px 9px", border: `1px solid ${trigger === t ? T.horizon : T.hair}`, background: trigger === t ? T.horizon : "transparent", color: trigger === t ? "#fff" : T.ink, cursor: "pointer" }}>{t}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="f-mono" style={{ fontSize: 9, color: T.muted, marginBottom: 5 }}>SCALE, IN PERSON?</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SCALES.map((s) => (
              <button key={s} onClick={() => setScale(scale === s ? "" : s)} className="f-mono" style={{ fontSize: 10, padding: "4px 9px", border: `1px solid ${scale === s ? T.seal : T.hair}`, background: scale === s ? T.seal : "transparent", color: scale === s ? "#fff" : T.ink, cursor: "pointer" }}>{s}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="f-mono" style={{ fontSize: 10, color: T.muted, display: "block", marginBottom: 4 }}>WHAT DOES THIS MEAN TO YOU?</label>
          <textarea value={personalMeaning} onChange={(e) => setPersonalMeaning(e.target.value)} placeholder="Not what it means in general — what it means to you. As long as you need." style={{ ...inputStyleBase, minHeight: 90, resize: "vertical" }} maxLength={2000} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button onClick={() => { if (window.confirm("Remove this piece from your gallery and canon? This can't be undone.")) onDelete(work.id); }} className="f-mono" style={{ fontSize: 11, color: T.seal, background: "none", border: `1px solid ${T.seal}`, padding: "10px 14px", cursor: "pointer" }}>DELETE</button>
        <button disabled={!title.trim() || saving} onClick={submit} className="f-mono" style={{ flex: 1, padding: "10px 0", fontSize: 11.5, letterSpacing: "0.06em", background: title.trim() ? T.accent : T.hair, color: title.trim() ? "#fff" : T.muted, border: "none", cursor: title.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : "SAVE CHANGES"}
        </button>
      </div>
    </ModalShell>
  );
}

function ReflectModal({ onClose, onSaveToGallery }) {
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [phase, setPhase] = useState("start"); // start | camera | thinking | prompts | done
  const [cameraError, setCameraError] = useState("");
  const [prompts, setPrompts] = useState(null);
  const [step, setStep] = useState(0);
  const [notes, setNotes] = useState({});
  const [revealed, setRevealed] = useState(null);
  const [revealBusy, setRevealBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [listening, setListening] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recRef = useRef(null);

  const speechSupported = typeof window !== "undefined" && !!window.speechSynthesis;
  const micSupported = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const stopCamera = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  };
  useEffect(() => () => { stopCamera(); if (window.speechSynthesis) window.speechSynthesis.cancel(); }, []);

  const startCamera = async () => {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setPhase("camera");
    } catch (e) {
      setCameraError("Couldn't reach your camera — check this site's camera permission, or upload a photo instead.");
    }
  };
  useEffect(() => {
    if (phase === "camera" && videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  }, [phase]);

  const processImage = async (dataUrl) => {
    setImageDataUrl(dataUrl);
    setPhase("thinking");
    const result = await aiGuideReflection(dataUrl);
    setPrompts(result?.prompts?.length ? result.prompts : [
      "What's the first thing your eye goes to?",
      "What do you think is happening here?",
      "What mood does this put you in?",
      "Is there a detail you almost missed?",
    ]);
    setStep(0);
    setPhase("prompts");
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const scale = Math.min(1, 640 / video.videoWidth);
    const w = Math.round(video.videoWidth * scale), h = Math.round(video.videoHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    stopCamera();
    processImage(dataUrl);
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImgBusy(true);
    let compressed = null;
    try { compressed = await compressImage(file); } catch (err) { console.error(err); }
    setImgBusy(false);
    if (compressed) processImage(compressed);
  };

  // Speaks every prompt aloud the moment it appears — this mode is built to work
  // without reading or typing at all, if you don't want to. A real, live browser
  // voice generated fresh from the prompt text, not a recording.
  useEffect(() => {
    if (phase !== "prompts" || !voiceOn || !speechSupported) return;
    window.speechSynthesis.cancel();
    const u = new window.SpeechSynthesisUtterance(prompts[step]);
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
    return () => window.speechSynthesis.cancel();
  }, [phase, step, voiceOn]);

  const toggleListen = () => {
    if (!micSupported) return;
    if (listening) { recRef.current?.stop(); return; }
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new Rec();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setNotes((prev) => ({ ...prev, [step]: ((prev[step] || "") + " " + text).trim() }));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const reveal = async () => {
    setRevealBusy(true);
    const result = await aiIdentifyArtwork(imageDataUrl);
    setRevealBusy(false);
    setRevealed(result);
  };

  const saveIt = () => {
    onSaveToGallery({
      id: uid(), imageDataUrl, mine: true,
      title: (revealed && revealed.title) || "A piece you reflected on",
      artist: (revealed && revealed.artist) || "",
      year: (revealed && revealed.year) || "",
      medium: (revealed && revealed.medium) || "Photograph",
      museum: "",
      reflectionNotes: Object.values(notes).map((n) => (n || "").trim()).filter(Boolean),
      acc: `PH.${new Date().getFullYear()}.${String(Math.floor(Math.random() * 9999)).padStart(4, "0")}`,
    });
    onClose();
  };

  const handleClose = () => { stopCamera(); if (window.speechSynthesis) window.speechSynthesis.cancel(); onClose(); };

  return (
    <ModalShell title="See a piece" onClose={handleClose}>
      {phase === "start" && (
        <>
          <p style={{ fontSize: 12.5, color: T.muted, marginBottom: 14, lineHeight: 1.5 }}>
            Every art-scanner app races to tell you what you're looking at in half a second. This one does the
            opposite — point your camera and it'll ask you to actually look, out loud, hands-free if you want.
          </p>
          <button onClick={startCamera} className="f-mono" style={{ width: "100%", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: `1px solid ${T.horizon}`, background: T.horizon, color: "#fff", padding: "14px 0", fontSize: 12, cursor: "pointer" }}>
            <Sparkles size={15} /> POINT MY CAMERA AT IT
          </button>
          {cameraError && <div className="f-mono" style={{ fontSize: 10.5, color: T.seal, marginBottom: 10 }}>{cameraError}</div>}
          <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: `1px dashed ${T.hair}`, padding: "14px 0", cursor: "pointer", color: T.muted, fontSize: 12 }}>
            {imgBusy ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <ImageIcon size={15} />}
            {imgBusy ? "Processing…" : "Or upload a photo instead"}
            <input type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
          </label>
        </>
      )}
      {phase === "camera" && (
        <div>
          <div style={{ position: "relative", background: "#000", marginBottom: 12 }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", maxHeight: 320, objectFit: "cover", display: "block" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { stopCamera(); setPhase("start"); }} className="f-mono" style={{ fontSize: 11, padding: "12px 16px", border: `1px solid ${T.hair}`, background: "none", color: T.ink, cursor: "pointer" }}>CANCEL</button>
            <button onClick={capture} className="f-mono" style={{ flex: 1, fontSize: 12, letterSpacing: "0.05em", padding: "12px 0", border: "none", background: T.horizon, color: "#fff", cursor: "pointer" }}>CAPTURE</button>
          </div>
        </div>
      )}
      {phase === "thinking" && (
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <img src={imageDataUrl} alt="" style={{ maxHeight: 140, margin: "0 auto 14px", display: "block", border: `1px solid ${T.hair}` }} />
          <Spinner label="Looking closely…" />
        </div>
      )}
      {phase === "prompts" && (
        <div>
          <img src={imageDataUrl} alt="" style={{ width: "100%", maxHeight: 170, objectFit: "cover", marginBottom: 14, border: `1px solid ${T.hair}` }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div className="f-mono" style={{ fontSize: 9, color: T.muted, letterSpacing: "0.05em" }}>{step + 1} OF {prompts.length}</div>
            {speechSupported && (
              <button onClick={() => setVoiceOn((v) => !v)} title={voiceOn ? "Turn voice off" : "Turn voice on"} className="f-mono" style={{ fontSize: 9, color: voiceOn ? T.horizon : T.muted, background: "none", border: `1px solid ${voiceOn ? T.horizon : T.hair}`, padding: "3px 8px", cursor: "pointer" }}>
                {voiceOn ? "VOICE ON" : "VOICE OFF"}
              </button>
            )}
          </div>
          <div className="f-display" style={{ fontSize: 17, lineHeight: 1.4, marginBottom: 12, color: T.ink }}>{prompts[step]}</div>
          <div style={{ position: "relative", marginBottom: 14 }}>
            <textarea value={notes[step] || ""} onChange={(e) => setNotes({ ...notes, [step]: e.target.value })} placeholder={micSupported ? "Jot a thought, or tap the mic to just say it" : "Jot a thought, if you want — totally optional"} style={{ ...inputStyleBase, minHeight: 60, resize: "vertical", paddingRight: micSupported ? 40 : 10 }} />
            {micSupported && (
              <button onClick={toggleListen} title={listening ? "Stop listening" : "Speak your answer"} style={{ position: "absolute", right: 8, top: 8, background: listening ? T.seal : "none", border: `1px solid ${listening ? T.seal : T.hair}`, borderRadius: "50%", width: 26, height: 26, cursor: "pointer", color: listening ? "#fff" : T.muted, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
                ●
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={step === 0} onClick={() => setStep((s) => s - 1)} className="f-mono" style={{ fontSize: 11, padding: "9px 14px", border: `1px solid ${T.hair}`, background: "none", color: T.ink, cursor: step === 0 ? "default" : "pointer", opacity: step === 0 ? 0.4 : 1 }}>BACK</button>
            {step < prompts.length - 1 ? (
              <button onClick={() => setStep((s) => s + 1)} className="f-mono" style={{ flex: 1, fontSize: 11, padding: "9px 0", border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>NEXT</button>
            ) : (
              <button onClick={() => setPhase("done")} className="f-mono" style={{ flex: 1, fontSize: 11, padding: "9px 0", border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>I'M DONE LOOKING</button>
            )}
          </div>
        </div>
      )}
      {phase === "done" && (
        <div>
          <img src={imageDataUrl} alt="" style={{ width: "100%", maxHeight: 170, objectFit: "cover", marginBottom: 14, border: `1px solid ${T.hair}` }} />
          {!revealed ? (
            <button onClick={reveal} disabled={revealBusy} className="f-mono" style={{ width: "100%", marginBottom: 12, fontSize: 11, padding: "10px 0", border: `1px solid ${T.horizon}`, background: "none", color: T.horizon, cursor: revealBusy ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {revealBusy ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : "✦"} WANT THE BACKGROUND ON THIS PIECE?
            </button>
          ) : (
            <div style={{ marginBottom: 12, fontSize: 12.5, color: T.ink, background: T.paper, border: `1px dashed ${T.hair}`, padding: "10px 12px" }}>
              <div className="f-mono" style={{ fontSize: 9, color: T.muted, marginBottom: 4 }}>{revealed.confidence === "low" ? "NOT CONFIDENTLY IDENTIFIED" : (revealed.title || "").toUpperCase()}</div>
              {revealed.description}
            </div>
          )}
          <button onClick={saveIt} className="f-mono" style={{ width: "100%", fontSize: 11.5, letterSpacing: "0.06em", padding: "10px 0", border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>
            SAVE TO MY GALLERY
          </button>
        </div>
      )}
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(38,36,31,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50, overflowY: "auto" }}>
      <div className="f-body pat-modal-in" style={{ background: T.card, border: `1px solid ${T.hair}`, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", width: "100%", maxWidth: 460, padding: "24px 24px 22px", margin: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <div className="f-display" style={{ fontSize: 19 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.ink }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LogVisitModal({ onClose, onSave, communityMuseums, onAddCommunity }) {
  const [museum, setMuseum] = useState("");
  const [exhibit, setExhibit] = useState("");
  const [rating, setRating] = useState(4);
  const [note, setNote] = useState("");
  const [share, setShare] = useState(true);
  const [saving, setSaving] = useState(false);
  const mustSees = useMemo(() => MUST_SEES[museum.split(" — ")[0].trim()] || [], [museum]);

  const submit = async () => {
    if (!museum.trim()) return;
    setSaving(true);
    await onSave({ id: uid(), museum: museum.trim(), exhibit: exhibit.trim() || "General visit", rating, date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }), note: note.trim() }, share);
    setSaving(false);
  };

  return (
    <ModalShell title="Log a visit" onClose={onClose}>
      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <label className="f-mono" style={{ fontSize: 10, color: T.muted }}>MUSEUM</label>
          <MuseumPicker value={museum} onValueChange={setMuseum} communityMuseums={communityMuseums} onAddCommunity={onAddCommunity} />
          {mustSees.length > 0 && (
            <div className="f-mono" style={{ fontSize: 10, color: T.moss, background: T.paper, border: `1px dashed ${T.hair}`, padding: "6px 8px", marginTop: 6 }}>
              DON'T MISS: {mustSees.map((m) => m.work).join(" · ")}
            </div>
          )}
        </div>
        <div>
          <label className="f-mono" style={{ fontSize: 10, color: T.muted }}>EXHIBIT (OPTIONAL)</label>
          <input style={inputStyleBase} value={exhibit} onChange={(e) => setExhibit(e.target.value)} placeholder="e.g. Permanent collection" />
        </div>
        <div>
          <label className="f-mono" style={{ fontSize: 10, color: T.muted, display: "block", marginBottom: 4 }}>RATING</label>
          <Stars value={rating} onChange={setRating} />
        </div>
        <div>
          <label className="f-mono" style={{ fontSize: 10, color: T.muted }}>NOTE</label>
          <textarea style={{ ...inputStyleBase, minHeight: 70, resize: "vertical" }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What stayed with you?" maxLength={500} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.muted, cursor: "pointer" }}>
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> Share this to the live Feed for everyone using Patinir
        </label>
      </div>
      <button disabled={!museum.trim() || saving} onClick={submit} className="f-mono" style={{ marginTop: 18, width: "100%", padding: "10px 0", fontSize: 11.5, letterSpacing: "0.06em", background: museum.trim() ? T.accent : T.hair, color: museum.trim() ? "#fff" : T.muted, border: "none", cursor: museum.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : "SAVE VISIT"}
      </button>
    </ModalShell>
  );
}

function AddWorkModal({ onClose, onSave, communityMuseums, onAddCommunity }) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [year, setYear] = useState("");
  const [medium, setMedium] = useState("");
  const [museum, setMuseum] = useState("");
  const [mine, setMine] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [locBusy, setLocBusy] = useState(false);
  const [locResult, setLocResult] = useState(null);
  const [dominantColors, setDominantColors] = useState([]);
  const [pickedColor, setPickedColor] = useState(null);
  const [emotion, setEmotion] = useState("");
  const [subject, setSubject] = useState("");
  const [trigger, setTrigger] = useState("");
  const [scale, setScale] = useState("");
  const [shareToFeed, setShareToFeed] = useState(false);
  const [sharePhoto, setSharePhoto] = useState(false);

  const runIdentify = async (imgUrl) => {
    const src = imgUrl || imageDataUrl;
    if (!src) return;
    setAiBusy(true);
    const result = await aiIdentifyArtwork(src);
    setAiBusy(false);
    if (!result) { setAiSuggestion({ description: "Couldn't reach the AI just now — you can still fill this in yourself.", confidence: "low" }); return; }
    setAiSuggestion(result);
    if (result.confidence !== "low") {
      if (!title.trim() && result.title) setTitle(result.title);
      if (!artist.trim() && result.artist) setArtist(result.artist);
      if (!year.trim() && result.year) setYear(result.year);
    }
    if (!medium.trim() && result.medium) setMedium(result.medium);
    if (!emotion && result.suggestedEmotion && EMOTIONS.includes(result.suggestedEmotion)) setEmotion(result.suggestedEmotion);
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImgBusy(true);
    setAiSuggestion(null); setLocResult(null); setDominantColors([]); setPickedColor(null);
    let compressed = null;
    try { compressed = await compressImage(file); setImageDataUrl(compressed); setMine(true); } catch (err) { console.error(err); }
    setImgBusy(false);
    if (compressed) {
      extractDominantColors(compressed).then(setDominantColors);
      runIdentify(compressed);
    }

    setLocBusy(true);
    const gps = await extractExifGPS(file);
    if (!gps) { setLocResult({ status: "none" }); setLocBusy(false); return; }
    const place = await aiLocateMuseum(gps.lat, gps.lng);
    setLocBusy(false);
    if (!place) { setLocResult({ status: "error" }); return; }
    setLocResult({ status: "found", ...place });
    if (!museum.trim()) {
      if (place.museum && place.confidence !== "low") setMuseum(`${place.museum} — ${place.city}`);
      else if (place.city) setMuseum(place.city);
    }
  };

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const newWork = {
      id: uid(), title: title.trim(), artist: artist.trim(), year: year.trim(),
      medium: medium.trim() || (mine ? "Photograph" : ""), museum: museum.trim(), mine, imageDataUrl,
      emotion: emotion || null, pickedColor: pickedColor || null, colors: dominantColors,
      subject: subject || null, trigger: trigger || null, scale: scale || null,
      acc: `${mine ? "PH" : "AC"}.${new Date().getFullYear()}.${String(Math.floor(Math.random() * 9999)).padStart(4, "0")}`,
    };
    await onSave(newWork);
    if (shareToFeed) {
      try {
        await api.postFeed({ kind: "piece", title: newWork.title, artist: newWork.artist, medium: newWork.medium, subject: newWork.subject, museum: newWork.museum, imageDataUrl: sharePhoto ? imageDataUrl : null });
      } catch (e) { console.error(e); }
    }
    setSaving(false);
  };

  return (
    <ModalShell title="Add a piece or photo" onClose={onClose}>
      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <label className="f-mono" style={{ fontSize: 10, color: T.muted, display: "block", marginBottom: 4 }}>IMAGE (OPTIONAL)</label>
          {imageDataUrl ? (
            <div style={{ position: "relative" }}>
              <img src={imageDataUrl} alt="" style={{ width: "100%", maxHeight: 160, objectFit: "cover", border: `1px solid ${T.hair}` }} />
              <button onClick={() => setImageDataUrl(null)} style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}><X size={12} /></button>
            </div>
          ) : (
            <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: `1px dashed ${T.hair}`, padding: "18px 0", cursor: "pointer", color: T.muted, fontSize: 12.5 }}>
              {imgBusy ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <ImageIcon size={14} />}
              {imgBusy ? "Processing…" : "Upload a photo you took"}
              <input type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
            </label>
          )}
          {locBusy && <div className="f-mono" style={{ fontSize: 8.5, color: T.muted, marginTop: 4 }}>Reading the photo's location data…</div>}
          {locResult?.status === "found" && (
            <div className="f-mono" style={{ fontSize: 8.5, color: T.moss, marginTop: 4 }}>
              📍 Photo location: {locResult.museum ? `${locResult.museum}, ` : ""}{locResult.city || "unknown"}{locResult.confidence === "low" ? " (rough guess — please confirm)" : ""}
            </div>
          )}
          {locResult?.status === "none" && (
            <div className="f-mono" style={{ fontSize: 8.5, color: T.muted, marginTop: 4 }}>No location data in this photo — common after sharing/exporting. Pick the museum yourself below.</div>
          )}
          {imageDataUrl && aiBusy && (
            <div className="f-mono" style={{ marginTop: 8, fontSize: 10, color: T.horizon, display: "flex", alignItems: "center", gap: 6 }}>
              <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> Reading the piece…
            </div>
          )}
          {imageDataUrl && !aiBusy && (
            <div className="f-mono" style={{ fontSize: 8.5, color: T.muted, marginTop: 4 }}>
              Sends this photo to Claude once, to look at it — not stored anywhere else.
              {aiSuggestion && <button onClick={() => runIdentify()} style={{ marginLeft: 6, background: "none", border: "none", color: T.horizon, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit", fontSize: "inherit" }}>Try again</button>}
            </div>
          )}
          {aiSuggestion && (
            <div style={{ marginTop: 8 }}>
              {aiSuggestion.firstRead && (
                <div style={{ fontSize: 12.5, color: T.ink, background: T.card, border: `1px solid ${T.horizon}`, padding: "9px 10px", marginBottom: 6 }}>
                  <div className="f-mono" style={{ fontSize: 8.5, color: T.horizon, marginBottom: 3, letterSpacing: "0.04em" }}>✦ FIRST READ — GETS SHARPER AS YOU ADD MORE</div>
                  {aiSuggestion.firstRead}
                </div>
              )}
              <div style={{ fontSize: 11.5, color: T.ink, background: T.paper, border: `1px dashed ${T.hair}`, padding: "8px 10px" }}>
                <div className="f-mono" style={{ fontSize: 8.5, color: T.muted, marginBottom: 3, letterSpacing: "0.04em" }}>
                  AI GUESS ({(aiSuggestion.confidence || "low").toUpperCase()} CONFIDENCE) — VERIFY BEFORE SAVING
                </div>
                {aiSuggestion.description}
              </div>
            </div>
          )}
          {dominantColors.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="f-mono" style={{ fontSize: 9, color: T.muted, marginBottom: 5 }}>WHICH COLOR PULLED YOU IN? (OPTIONAL)</div>
              <div style={{ display: "flex", gap: 7 }}>
                {dominantColors.map((c) => (
                  <button key={c} onClick={() => setPickedColor(pickedColor === c ? null : c)} title={c} style={{ width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer", border: pickedColor === c ? `2px solid ${T.ink}` : `1px solid ${T.hair}` }} />
                ))}
              </div>
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <div className="f-mono" style={{ fontSize: 9, color: T.muted, marginBottom: 5 }}>HOW DID IT MAKE YOU FEEL? (OPTIONAL)</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {EMOTIONS.map((em) => (
                <button key={em} onClick={() => setEmotion(emotion === em ? "" : em)} className="f-mono" style={{ fontSize: 10, padding: "4px 9px", border: `1px solid ${emotion === em ? T.accent : T.hair}`, background: emotion === em ? T.accent : "transparent", color: emotion === em ? "#fff" : T.ink, cursor: "pointer" }}>{em}</button>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <div className="f-mono" style={{ fontSize: 9, color: T.muted, marginBottom: 5 }}>WHAT KIND OF SUBJECT IS IT? (OPTIONAL)</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {SUBJECTS.map((s) => (
                <button key={s} onClick={() => setSubject(subject === s ? "" : s)} className="f-mono" style={{ fontSize: 10, padding: "4px 9px", border: `1px solid ${subject === s ? T.moss : T.hair}`, background: subject === s ? T.moss : "transparent", color: subject === s ? "#fff" : T.ink, cursor: "pointer" }}>{s}</button>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <div className="f-mono" style={{ fontSize: 9, color: T.muted, marginBottom: 5 }}>WHAT PULLED YOU IN FIRST? (OPTIONAL)</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {TRIGGERS.map((t) => (
                <button key={t} onClick={() => setTrigger(trigger === t ? "" : t)} className="f-mono" style={{ fontSize: 10, padding: "4px 9px", border: `1px solid ${trigger === t ? T.horizon : T.hair}`, background: trigger === t ? T.horizon : "transparent", color: trigger === t ? "#fff" : T.ink, cursor: "pointer" }}>{t}</button>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <div className="f-mono" style={{ fontSize: 9, color: T.muted, marginBottom: 5 }}>SCALE, IN PERSON? (OPTIONAL)</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {SCALES.map((s) => (
                <button key={s} onClick={() => setScale(scale === s ? "" : s)} className="f-mono" style={{ fontSize: 10, padding: "4px 9px", border: `1px solid ${scale === s ? T.seal : T.hair}`, background: scale === s ? T.seal : "transparent", color: scale === s ? "#fff" : T.ink, cursor: "pointer" }}>{s}</button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className="f-mono" style={{ fontSize: 10, color: T.muted }}>TITLE</label>
          <input style={inputStyleBase} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Woman Reading by Lamplight" />
        </div>
        {!mine && (
          <div>
            <label className="f-mono" style={{ fontSize: 10, color: T.muted }}>ARTIST</label>
            <input style={inputStyleBase} value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="e.g. M. Vetter" />
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label className="f-mono" style={{ fontSize: 10, color: T.muted }}>YEAR</label>
            <input style={inputStyleBase} value={year} onChange={(e) => setYear(e.target.value)} placeholder="e.g. 1932" />
          </div>
          <div>
            <label className="f-mono" style={{ fontSize: 10, color: T.muted }}>MEDIUM</label>
            <input style={inputStyleBase} value={medium} onChange={(e) => setMedium(e.target.value)} placeholder="e.g. Oil on canvas" />
          </div>
        </div>
        <div>
          <label className="f-mono" style={{ fontSize: 10, color: T.muted }}>MUSEUM</label>
          <MuseumPicker value={museum} onValueChange={setMuseum} communityMuseums={communityMuseums} onAddCommunity={onAddCommunity} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.muted, cursor: "pointer" }}>
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> This is my own photograph, not an official reproduction
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.muted, cursor: "pointer" }}>
          <input type="checkbox" checked={shareToFeed} onChange={(e) => { setShareToFeed(e.target.checked); if (!e.target.checked) setSharePhoto(false); }} /> Share this to the live Feed for everyone using Patinir
        </label>
        {shareToFeed && imageDataUrl && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: T.muted, cursor: "pointer", marginLeft: 22 }}>
            <input type="checkbox" checked={sharePhoto} onChange={(e) => setSharePhoto(e.target.checked)} /> Also share the photo itself — there's no automated review on shared photos yet, so only do this for one you'd be fine with anyone seeing
          </label>
        )}
      </div>
      <button disabled={!title.trim() || saving} onClick={submit} className="f-mono" style={{ marginTop: 18, width: "100%", padding: "10px 0", fontSize: 11.5, letterSpacing: "0.06em", background: title.trim() ? T.accent : T.hair, color: title.trim() ? "#fff" : T.muted, border: "none", cursor: title.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : "ADD TO GALLERY"}
      </button>
    </ModalShell>
  );
}

/* ============================= mount ============================= */
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
