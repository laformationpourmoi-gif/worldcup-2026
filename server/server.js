/* ============================================================================
   WORLD CUP 2026 — AI AGGREGATION BACKEND
   ----------------------------------------------------------------------------
   "An AI gives me up-to-date results." This service asks Claude (with the
   built-in web_search tool) to research the LIVE state of the FIFA World Cup
   2026 and return ONE strict JSON snapshot in the exact shape the front-end
   expects. The snapshot is cached (default 10 min) so we don't hit the API on
   every page load, and served at GET /api/snapshot.

   The static dashboard (../index.html) is served from /, so once this server
   runs, the page's loadLiveData() picks up the live feed automatically.

   SECURITY: the API key is read from the environment (ANTHROPIC_API_KEY).
   Never hard-code it. See .env.example.
   ============================================================================ */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFreeSnapshot } from './free-feed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ── Config (all overridable via env, never hard-code secrets) ───────────── */
const PORT          = Number(process.env.PORT || 3000);
const FEED          = (process.env.FEED || 'free').toLowerCase();          // 'free' (no tokens, default) | 'ai' (Claude + web search)
const MODEL         = process.env.WC_MODEL || 'claude-sonnet-4-6';         // AI mode only; WC_MODEL=claude-opus-4-8 for max quality
const EFFORT        = process.env.WC_EFFORT || 'medium';                    // AI mode only: low | medium | high | max
const CACHE_TTL_MS  = Number(process.env.CACHE_TTL_MS || 10 * 60 * 1000);  // 10 minutes
const MAX_CONT      = 4;                                                    // server-tool pause_turn continuations

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment (AI mode only)

if (FEED === 'ai' && !process.env.ANTHROPIC_API_KEY) {
  console.warn('⚠️  FEED=ai but ANTHROPIC_API_KEY is not set — /api/snapshot will 503 until you add it to .env');
}

/* ── The data contract ──────────────────────────────────────────────────────
   This is the SAME shape as the DATA object in index.html. The model must
   return exactly these keys so the front-end can merge the snapshot directly.
   Kept in the (stable) system prompt so prompt caching can kick in. */
const SYSTEM_PROMPT = `You are the data engine for a bilingual (French/English) FIFA World Cup 2026 dashboard.
The tournament runs 11 June – 19 July 2026, hosted by the USA, Canada and Mexico (48 teams, 12 groups A–L, 104 matches, 16 host cities).

Your job: research the CURRENT, REAL state of the tournament using web search of reputable sources
(FIFA.com, ESPN, BBC Sport, The Athletic, Reuters, AP, Olympics.com, RDS, Wikipedia), then return ONE JSON
object describing it. Cross-check at least two sources for scores and standings.

Return ONLY the JSON object — no prose, no markdown, no code fences. Use this EXACT shape and key names:

{
  "status": "pre" | "live" | "finished",        // overall tournament phase right now
  "updatedAt": <unix ms>,                         // Date.now() at generation time
  "tournament": {
    "status": "pre"|"live"|"finished",
    "teams": 48, "matches": 104, "groups": 12, "cities": 16, "stadiums": 16, "nations_hosting": 3,
    "duration_days": 39, "players": "1,100+",
    "goalsTotal": <number, 0 before kickoff>,
    "goalsAvg": "<string, e.g. 2.7, or — before kickoff>",
    "topGoals": "<string, current Golden Boot leader's goal count, or — before kickoff>",
    "attendance": "<string, e.g. 3.1M, or — before kickoff>"
  },
  "groups": [   // all 12 groups A..L
    { "name": "A", "status": "upcoming"|"ongoing"|"finished",
      "teams": [ { "name": "...", "flag": "🇲🇽", "rank": <FIFA rank int>,
                   "pj": <played>, "g": <won>, "n": <drawn>, "p": <lost>,
                   "gf": <goals for>, "gc": <goals against>, "pts": <points>,
                   "form": ["W","D","L", ...] }  // last up-to-5 results, [] if none yet
      ] }   // teams ordered by standing once play starts; by FIFA rank before
  ],
  "matches": [  // upcoming + live + finished; for the current/next matchday, ~10-16 items
    { "id": <int>, "status": "upcoming"|"live"|"finished", "minute": <int, live only>,
      "opener": <true only for the 11 June opening match>,
      "home": { "name": "...", "flag": "🇧🇷", "rank": <int> },
      "away": { "name": "...", "flag": "🇲🇦", "rank": <int> },
      "score": null | { "home": <int>, "away": <int> },
      "group": "A".."L" (or "R32","R16","QF","SF","3P","F" for knockouts),
      "date": "YYYY-MM-DD", "time": "HH:MM ET", "venue": "<Stadium · City> or empty string" }
  ],
  "scorers":   [ { "name": "...", "flag": "🇫🇷", "team": "France", "goals": <int>, "assists": <int> } ],  // [] before first goal
  "assisters": [ { "name": "...", "flag": "🇧🇪", "team": "Belgium", "assists": <int>, "goals": <int> } ],  // [] before first assist
  "watchlist": [ { "name": "...", "flag": "🇫🇷", "team": "France" } ],   // pre-tournament stars to watch (editorial)
  "teams": [    // ~12-16 featured sides: top FIFA-ranked contenders + the 3 hosts
    { "name": "...", "flag": "🇪🇸", "rank": <int>, "group": "A".."L",
      "pts": <int>, "gf": <int>, "ga": <int>, "form": ["W", ...],
      "favorites": <bool, title contenders>, "host": <bool, USA/Canada/Mexico> }
  ],
  "news": [     // 6 recent, relevant, REAL articles, newest first
    { "id": <int>, "featured": <bool, exactly one true>,
      "source": "ESPN", "date": "<human date>",
      "title_fr": "...", "title_en": "...",
      "excerpt_fr": "...", "excerpt_en": "...",
      "emoji": "<one emoji>", "color": "<dark hex like #0b3d2e>", "url": "<real article URL>" }
  ]
}

RULES:
- Use REAL data only. Never invent scores, standings, scorers, or articles. If the tournament has not
  started yet, set every played/points/goals stat to 0, leave "form" as [], "scorers"/"assisters" as [],
  status "pre"/"upcoming", and populate "matches" with the real upcoming fixtures.
- Flags MUST be the correct emoji flag for each nation (England 🏴󠁧󠁢󠁥󠁮󠁧󠁿, Scotland 🏴󠁧󠁢󠁳󠁣󠁴󠁿).
- "rank" is the latest FIFA/Coca-Cola World Ranking position (integer).
- Kick-off times in US Eastern Time, suffixed " ET".
- News: title AND excerpt in BOTH French (..._fr) and English (..._en); cite the real source name and a real URL.
- Output minified JSON, parseable by JSON.parse, with no trailing commentary.`;

/* ── In-memory cache + single-flight (stale-while-error) ─────────────────── */
let cache = { data: null, ts: 0 };
let inflight = null;

function isFresh() {
  return cache.data && (Date.now() - cache.ts) < CACHE_TTL_MS;
}

/* ── Pull the JSON out of Claude's final message (defensive) ─────────────── */
function extractJson(message) {
  const text = (message.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();

  let s = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(s); } catch { /* fall through */ }

  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(s.slice(start, end + 1)); // throws if still invalid → caught by caller
  }
  throw new Error('Model returned no parseable JSON');
}

/* ── Ask Claude to research + assemble the snapshot ──────────────────────── */
async function buildSnapshot() {
  const today = new Date().toISOString().slice(0, 10);

  // The volatile bit (today's date) goes in the USER turn so the cached
  // SYSTEM prefix stays byte-identical between requests.
  let messages = [{
    role: 'user',
    content: `Today is ${today}. Produce the current World Cup 2026 snapshot as specified. `
           + `Search the web for the latest standings, fixtures/results, top scorers and news, then return the JSON object only.`,
  }];

  let final;
  for (let i = 0; i < MAX_CONT; i++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },          // let Claude reason over conflicting sources
      output_config: { effort: EFFORT },        // low | medium | high | max
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }, // prompt caching
      ],
      tools: [
        {
          type: 'web_search_20260209',
          name: 'web_search',
          max_uses: 8,
          allowed_domains: [
            'fifa.com', 'espn.com', 'bbc.com', 'bbc.co.uk', 'theathletic.com',
            'reuters.com', 'apnews.com', 'olympics.com', 'rds.ca', 'en.wikipedia.org',
          ],
        },
      ],
      messages,
    });

    final = await stream.finalMessage();

    // Server-tool loop hit its cap — re-send to let it resume (no extra user turn).
    if (final.stop_reason === 'pause_turn') {
      messages = [...messages, { role: 'assistant', content: final.content }];
      continue;
    }
    break;
  }

  const snap = extractJson(final);
  snap.updatedAt = snap.updatedAt || Date.now();
  if (final?.usage) {
    console.log(`[snapshot] tokens in=${final.usage.input_tokens} out=${final.usage.output_tokens} `
      + `cache_read=${final.usage.cache_read_input_tokens ?? 0}`);
  }
  return snap;
}

/* ── Choose the active feed: free (default) or AI ───────────────────────── */
async function buildActiveSnapshot() {
  return FEED === 'ai' ? buildSnapshot() : buildFreeSnapshot();
}

/* ── Express app ─────────────────────────────────────────────────────────── */
const app = express();
app.use(cors());

// Serve the static dashboard (index.html lives one level up)
app.use(express.static(path.join(__dirname, '..')));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true, feed: FEED,
    model: FEED === 'ai' ? MODEL : null,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasFootballDataKey: !!process.env.FOOTBALLDATA_KEY,
    cachedAt: cache.ts || null,
  });
});

app.get('/api/snapshot', async (req, res) => {
  // Serve from cache unless ?refresh=1 forces a rebuild
  const force = req.query.refresh === '1';
  if (!force && isFresh()) {
    return res.json({ ...cache.data, _cache: { hit: true, ageMs: Date.now() - cache.ts } });
  }
  if (FEED === 'ai' && !process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'FEED=ai but ANTHROPIC_API_KEY not configured on the server.' });
  }

  try {
    // Single-flight: concurrent callers share one in-progress build.
    if (!inflight) {
      inflight = buildActiveSnapshot().finally(() => { inflight = null; });
    }
    const data = await inflight;
    cache = { data, ts: Date.now() };
    res.json({ ...data, _cache: { hit: false, ageMs: 0 } });
  } catch (err) {
    console.error('[snapshot] build failed:', err?.message || err);
    // Stale-while-error: better to serve slightly old real data than nothing.
    if (cache.data) {
      return res.json({ ...cache.data, _cache: { hit: true, stale: true, ageMs: Date.now() - cache.ts } });
    }
    res.status(502).json({ error: 'Failed to build snapshot', detail: String(err?.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`\n🏆  WC2026 AI feed running:  http://localhost:${PORT}`);
  console.log(`    Dashboard  →  http://localhost:${PORT}/`);
  console.log(`    Live JSON  →  http://localhost:${PORT}/api/snapshot`);
  const mode = FEED === 'ai' ? `AI (${MODEL}, effort ${EFFORT})` : 'FREE (football-data.org + RSS)';
  console.log(`    Feed: ${mode} · cache: ${Math.round(CACHE_TTL_MS / 60000)} min\n`);
});
