// All calls to Anthropic happen here, on the server, using ANTHROPIC_API_KEY
// from the environment. The browser never sees this key — it only ever
// talks to our own /api/ai/* routes, which call these functions.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

async function askClaude(system, userContent, { json = false } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set on the server");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  if (!text) return null;
  if (json) {
    try { return JSON.parse(text.replace(/```json|```/g, "").trim()); } catch { return null; }
  }
  return text;
}

async function identifyArtwork(base64Jpeg) {
  const system = 'You help someone catalog a photo they took at a museum, and offer one genuine read on their taste. Reply with ONLY a JSON object, no markdown fences, no preamble, shaped exactly like: {"title":"","artist":"","year":"","medium":"","description":"","confidence":"high|medium|low","suggestedEmotion":"","firstRead":""}. Only fill title/artist/year with a real guess if you actually recognize the specific work; if you do not, leave those three blank and set confidence to "low" — but still fill description with what is visually depicted. Never invent a plausible-sounding artist or title for a piece you do not actually recognize. "suggestedEmotion" must be exactly one of: Awe, Calm, Melancholy, Joy, Longing, Unease, Wonder, Nostalgia. "firstRead" is one sentence, specific and a little surprising, about what being drawn to this particular piece might say about someone\'s sensibility — no generic flattery, no therapy-speak, and it should read as a first impression, not a verdict.';
  return askClaude(system, [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Jpeg } },
    { type: "text", text: "Identify this artwork if you recognize it, describe what's shown, and give your first read." },
  ], { json: true });
}

async function guideReflection(base64Jpeg) {
  const system = 'You are a museum educator who practices Visual Thinking Strategies: you help people see and process art for themselves, standing right in front of it, instead of being told what it means. Look at the image and write exactly 4 short, open-ended prompts, in a natural order, that build on each other — starting with simple noticing (what draws the eye, composition, what is happening), moving toward feeling and personal connection. NEVER state facts about the artist, title, art history, or "the meaning" — this is the opposite of what you are doing. Do not editorialize or answer your own prompts. Reply with ONLY a JSON object, no markdown fences, no preamble, shaped exactly like: {"prompts":["","","",""]}.';
  return askClaude(system, [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Jpeg } },
    { type: "text", text: "Write the 4 guided noticing prompts for this piece." },
  ], { json: true });
}

async function locateMuseum(lat, lng) {
  const system = 'Given GPS coordinates, identify the city and, only if you are genuinely confident the coordinates sit at or within about 300m of a specific well-known public art museum, name that museum. Reply with ONLY a JSON object: {"city":"","museum":"","confidence":"high|medium|low"}. Leave "museum" blank and use confidence "low" rather than naming a plausible-sounding museum you are not actually sure about.';
  return askClaude(system, `Latitude: ${lat}, Longitude: ${lng}. Identify the location.`, { json: true });
}

async function curatorNote(canonWorks) {
  const list = canonWorks.map((w, i) => {
    const facts = [
      w.mine ? "a photograph taken by the person themself" : w.artist,
      w.medium, w.year ? `dated ${w.year}` : null,
      w.museum ? `seen at ${w.museum}` : null,
      w.subject ? `subject: ${w.subject}` : null,
      w.trigger ? `what pulled them in: ${w.trigger}` : null,
      w.scale ? `scale: ${w.scale}` : null,
      w.emotion ? `it made them feel: ${w.emotion}` : null,
      w.pickedColor ? `they were drawn to the color ${w.pickedColor}` : null,
      w.personalMeaning ? `what it means to them: "${w.personalMeaning}"` : null,
    ].filter(Boolean);
    return `${i + 1}. "${w.title}" — ${facts.join(", ")}`;
  }).join("\n");
  const system = "You are a perceptive curator writing a short, specific reflection (3-5 sentences) on someone's personal ranked canon of favorite artworks. You have real structured tags to work with — subject matter, what perceptually pulls them in (color vs. composition vs. light vs. story, etc.), preferred scale, era, plus their own written words about what pieces mean to them. Use these as real evidence and name the actual pattern specifically (e.g. 'four of your top five are intimate-scale interiors where light does the work, not story' beats 'you like quiet scenes'). Some pieces will have missing fields simply because the person didn't fill them in — that is not the same as the fact being unknown or absent, so never comment on a field being 'unknown' or 'undocumented'; just work with whatever facts are actually given. If the tags are sparse, say less rather than padding with generic praise. Write directly to them, second person, warm but not saccharine, no flattery for its own sake. Reply with ONLY the reflection, no preamble, no markdown.";
  return askClaude(system, `Here is the ranked canon, most important first:\n${list}\n\nWrite the reflection.`);
}

async function compareCanons(mine, theirs) {
  const fmt = (arr) => arr.map((w, i) => `${i + 1}. "${w.title}"${w.artist ? ` — ${w.artist}` : ""}${w.museum ? `, ${w.museum}` : ""}`).join("\n");
  const system = "You compare two people's personal art canons and write 2-3 sentences noting one genuine, specific point of overlap or contrast — not generic praise. Some entries will be missing an artist or museum simply because that field wasn't filled in; that's not the same as it being unknown, so don't comment on missing fields at all. If there is truly no overlap, say that plainly and describe the contrast instead. Reply with ONLY the comparison, no preamble.";
  return askClaude(system, `Canon A:\n${fmt(mine)}\n\nCanon B:\n${fmt(theirs)}\n\nWrite the comparison.`);
}

async function planVisit(city, knownMuseums) {
  const known = knownMuseums.length ? `Museums already confirmed in our own database for this city: ${knownMuseums.join(", ")}. Prefer these when they fit, but you may add others you're genuinely confident about.` : "We have no confirmed museums for this city in our database — rely on your own knowledge.";
  const system = `You are planning a museum visit for someone traveling to a city. ${known} Reply with ONLY a JSON object, no markdown fences, no preamble, shaped exactly like: {"museums":[{"name":"","why":"one line","mustSees":[{"work":"","artist":"","note":"one short line"}]}]}. Include 1-3 museums, no more than 10 mustSees total. Only include specific mustSees you're genuinely confident exist and are normally on view — otherwise describe the collection strength generally. If you don't know this city's museums at all, return {"museums":[]}.`;
  return askClaude(system, `City: ${city}. Build the plan.`, { json: true });
}

module.exports = { identifyArtwork, guideReflection, locateMuseum, curatorNote, compareCanons, planVisit };
