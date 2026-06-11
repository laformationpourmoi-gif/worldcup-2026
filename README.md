# 🏆 World Cup 2026 — Bilingual Dashboard (FR / EN)

A visual, mobile-first dashboard that aggregates and presents **FIFA World Cup 2026**
statistics (11 June – 19 July 2026 · USA · Canada · Mexico · 48 teams · 12 groups · 104 matches).

It ships in two layers:

1. **`index.html`** — a self-contained HTML/CSS/JS dashboard that works on its own with
   **real, up-to-date pre-tournament data** (the actual 5 Dec 2025 draw, FIFA rankings,
   matchday-1 fixtures and June 2026 news). Open it directly and it renders.
2. **`server/`** — an **AI aggregation backend**: Claude (with web search) researches the
   *live* state of the tournament and returns a strict JSON snapshot. When the server is
   running, the page upgrades itself from the static fallback to the live feed automatically.

```
┌──────────────┐   GET /api/snapshot   ┌────────────────────┐   web_search   ┌─────────────┐
│  index.html  │ ───────────────────▶  │  server.js (Node)  │ ─────────────▶ │  Claude API │
│ (loadLiveData│ ◀───────────────────  │  cache 10 min      │ ◀───────────── │ + the web   │
│  + fallback) │     live JSON         │  strict JSON       │   real data    └─────────────┘
└──────────────┘                       └────────────────────┘
```

> The page **always works** without the backend — it falls back to the embedded real
> pre-tournament data. The backend is what keeps scores, standings, scorers and news
> live for the whole tournament.

---

## 1. Run the visual dashboard (no backend)

Just open `index.html` in a browser, or serve the folder:

```bash
# any static server works
python -m http.server 5500
# → http://localhost:5500/index.html
```

The banner shows **📡 pre-tournament data** and the language toggle (FR/EN) persists via `localStorage`.

---

## 2. Run the live feed

Two interchangeable feeds, **same `/api/snapshot` output** — pick with the `FEED` env var:

| `FEED` | Source | Cost | Needs |
| --- | --- | --- | --- |
| **`free`** (default) | football-data.org (free key) + public RSS | **$0** | a free football-data.org key for stats; **news needs no key at all** |
| `ai` | Claude + web search | API tokens | `ANTHROPIC_API_KEY` |

### Free quickstart (no tokens)

```bash
cd server
cp .env.example .env     # FEED=free is already the default
#  → news refreshes immediately with NO key
#  → for live stats, paste a FREE football-data.org key into FOOTBALLDATA_KEY
npm install
npm start
# → http://localhost:3000/             (dashboard, served by the backend)
# → http://localhost:3000/api/snapshot (live JSON)
```

Open `http://localhost:3000/`. The banner flips to **🟢 Live data** and the feed re-polls every
5 minutes; the server caches each snapshot 10 minutes. With **no keys at all**, the **news**
refreshes for free and the rest keeps the accurate embedded data; add the free football-data.org
key and standings, fixtures, scores and scorers go live too — still **$0**.

Get the free key: <https://www.football-data.org/client/register> (World Cup competition code `WC`).

**Free news sources** (no key, balanced FR/EN, World-Cup-filtered): BBC Sport (EN), L'Équipe (FR),
Radio-Canada Sports (FR-CA). The feed interleaves languages so neither side dominates.

### Match detail panel (click any match)

With the free football-data key, clicking a match opens a panel with **goals (scorer + minute),
cards, referee and the score by period** — via `GET /api/match?id=<id>`. All free.

**Optional premium extras — possession / shots / xG.** Set `BALLDONTLIE_KEY`
(BALLDONTLIE FIFA API, GOAT tier — 48 h free trial at <https://app.balldontlie.io>) and the same
panel automatically adds possession (with bar), xG, shots / on target, big chances, corners,
fouls, yellow cards, saves and accurate passes. No key → the panel simply stays in free mode.
Matching between the two providers is done by canonical team names + date (their match IDs differ).

### Optional: AI feed (`FEED=ai`)

Set `FEED=ai` and `ANTHROPIC_API_KEY` in `.env` to use Claude + web search instead — richer,
fully bilingual news and resilient to source quirks, at the cost of API tokens.

### How the AI feed works (`FEED=ai`, `server/server.js`)

- **Model:** `claude-sonnet-4-6` — best speed/cost balance for frequent polling (override with `WC_MODEL=claude-opus-4-8` for maximum quality).
- **Web search:** the built-in server tool `web_search_20260209`, restricted to reputable
  domains (FIFA, ESPN, BBC, The Athletic, Reuters, AP, Olympics.com, RDS, Wikipedia).
- **Strict JSON:** a system prompt pins the exact schema (same keys as the page's `DATA`
  object); the response is parsed defensively (fences stripped, first `{` … last `}`).
- **Adaptive thinking + `effort`** so Claude can reconcile conflicting sources.
- **Prompt caching** (`cache_control: {type:"ephemeral"}`) on the stable system prompt;
  today's date lives in the user turn so the cached prefix stays byte-identical.
- **Caching + resilience:** 10-min in-memory cache, single-flight (concurrent callers share
  one build), and **stale-while-error** (serves the last good snapshot if a refresh fails).
- **`pause_turn` handling** for the server-side web-search loop.

### Endpoints

| Method & path             | Returns                                                            |
| ------------------------- | ----------------------------------------------------------------- |
| `GET /api/snapshot`       | The live JSON snapshot (`?refresh=1` forces a rebuild, bypassing cache). |
| `GET /api/health`         | `{ ok, model, hasKey, cachedAt }` for uptime checks.              |
| `GET /` and static files  | The dashboard itself (`index.html` one level up).                |

### Example: consume the feed yourself

```js
const res  = await fetch('http://localhost:3000/api/snapshot');
const snap = await res.json();
console.log(snap.status, snap.groups.length, snap.matches[0]);   // "pre" 12 {…}
```

The front-end merges only the keys the feed provides
(`tournament, hostCities, groups, matches, scorers, assisters, watchlist, teams, news`);
anything missing keeps the embedded real data. Override the feed URL by setting
`window.WC26_API_BASE = 'https://your-host'` before the page script runs.

---

## 3. Deploy

### Vercel / Netlify serverless

Drop the same logic into a serverless function so there's no always-on server. Example
`api/snapshot.js` for Vercel (set `ANTHROPIC_API_KEY` in the project's env vars):

```js
// api/snapshot.js  — Vercel serverless function
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic();
let cache = { data: null, ts: 0 };
const TTL = 10 * 60 * 1000;

export default async function handler(req, res) {
  if (cache.data && Date.now() - cache.ts < TTL) return res.json(cache.data);
  // …reuse buildSnapshot() from server.js (system prompt + web_search + extractJson)…
  const data = await buildSnapshot();
  cache = { data, ts: Date.now() };          // note: warm-instance cache only on serverless
  res.json(data);
}
```

Host `index.html` on the same domain (so `/api/snapshot` is same-origin) or set
`window.WC26_API_BASE`. On serverless, add a KV/Redis cache (e.g. Upstash) since the
in-memory cache only survives on a warm instance.

### Keep keys safe

The key is read from `process.env.ANTHROPIC_API_KEY` — it never appears in the client or in
git (`.env` is git-ignored). Rotate it if exposed.

---

## 4. Recommended data APIs (free vs paid)

The AI feed above is the simplest path (one key, handles stats **and** news, no scraper).
If you'd rather wire classic sports APIs, build thin `/api/*` adapters that return the same
JSON shape. Trade-offs:

| Source | What it gives | Free tier | Paid | Notes |
| --- | --- | --- | --- | --- |
| **AI aggregator** (this repo — Claude + web search) | Stats, fixtures, scorers **and** news, bilingual, in one call | Pay-as-you-go tokens | same | No scraping/CORS; ~1 call per 10-min cache window keeps cost low. Verify critical scores. |
| **API-Football** (api-sports.io) | Standings, fixtures, live scores, line-ups, top scorers | 100 req/day | from ~$/mo | Best coverage for a football app. Header `x-apisports-key`. Base `https://v3.football.api-sports.io`. |
| **football-data.org** | Competitions, standings, fixtures, scorers | 10 req/min (free) | tiers | Clean JSON, generous free tier. Header `X-Auth-Token`. WC competition code `WC`. |
| **SportRadar / Stats Perform** | Most comprehensive, official-grade, real-time | trial only | enterprise $$$ | Overkill unless you need ms-level live data / official feeds. |
| **NewsAPI.org** | Headlines & articles search | 100 req/day (dev only) | from ~$449/mo | News only. Free tier can't be used in production. |
| **GNews / Mediastack** | News search, cheaper than NewsAPI | small free tier | low-cost tiers | Good budget news option. |
| **RSS feeds** (ESPN, BBC, RDS…) | Article title/link/date/image | free | free | No key; parse server-side (RSS→JSON) to dodge browser CORS. |

**Why a backend at all?** A lone HTML page can't call most of these from the browser
(CORS + exposed keys). The Node/serverless layer holds the key, calls the API, caches the
response, and exposes clean same-origin JSON — which is exactly what `server.js` does.

---

## Files

```
index.html            Self-contained bilingual dashboard (real pre-tournament data + live-feed client)
server/
  server.js           Express backend: serves the dashboard + cached /api/snapshot (picks the feed)
  free-feed.js        FREE feed (default): football-data.org + RSS → JSON snapshot, no tokens
  package.json        Dependencies & scripts
  .env.example        Environment template (copy to .env)
  .gitignore
README.md             This file
```

> Data is aggregated for display and is **not affiliated with FIFA**.
