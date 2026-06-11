/* ============================================================================
   WORLD CUP 2026 — OPTIONAL "EXTRAS" FEED (possession / shots / xG)
   ----------------------------------------------------------------------------
   Source: BALLDONTLIE FIFA World Cup API (paid GOAT tier; 48 h free trial).
     Base:  https://api.balldontlie.io/fifa/worldcup/v1
     Auth:  Authorization: <key>      (env: BALLDONTLIE_KEY)
     Docs:  https://fifa.balldontlie.io/

   Wholly OPTIONAL: if the key is missing, expired, or the tier doesn't allow
   team_match_stats, every function returns null and the free match detail
   (goals/cards/referee from football-data) is untouched.

   Matching: football-data and balldontlie use different match IDs, so we match
   a match by CANONICAL TEAM NAMES + same UTC date (±1 day for timezone skew).
   ============================================================================ */

import { canon } from './free-feed.js';

const BDL_BASE = 'https://api.balldontlie.io/fifa/worldcup/v1';
const BDL_KEY = process.env.BALLDONTLIE_KEY || process.env.BalldontlieKey || process.env.BDL_KEY || '';

export const extrasEnabled = () => !!BDL_KEY;

async function bdl(pathname) {
  const res = await fetch(`${BDL_BASE}${pathname}`, { headers: { Authorization: BDL_KEY } });
  if (!res.ok) throw new Error(`balldontlie ${pathname} → HTTP ${res.status}`);
  return res.json();
}

/* ── Season match list, cached 10 min (cursor-paginated, ≤3 pages = 300) ── */
let matchListCache = { data: null, ts: 0 };
const LIST_TTL = 10 * 60 * 1000;

async function listMatches() {
  if (matchListCache.data && Date.now() - matchListCache.ts < LIST_TTL) return matchListCache.data;
  const all = [];
  let cursor = null;
  for (let page = 0; page < 3; page++) {
    const q = `/matches?seasons[]=2026&per_page=100${cursor ? `&cursor=${cursor}` : ''}`;
    const res = await bdl(q);
    all.push(...(res.data || []));
    cursor = res.meta?.next_cursor;
    if (!cursor) break;
  }
  matchListCache = { data: all, ts: Date.now() };
  return all;
}

/* ── Find the balldontlie match matching (homeName, awayName, dateISO) ──── */
function sameDay(aIso, bIso) {
  const a = new Date(aIso), b = new Date(bIso);
  return Math.abs(a - b) < 36 * 3600 * 1000; // ±36 h absorbs timezone + ET-vs-UTC date skew
}

async function findMatch(homeName, awayName, dateIso) {
  const h = canon(homeName), a = canon(awayName);
  const matches = await listMatches();
  return matches.find(m => {
    const mh = canon(m.home_team?.name), ma = canon(m.away_team?.name);
    const namesMatch = (mh === h && ma === a) || (mh === a && ma === h); // tolerate swapped home/away
    return namesMatch && (!dateIso || sameDay(m.datetime, dateIso));
  }) || null;
}

const num = v => (v === null || v === undefined || v === '') ? null : Number(v);

/* ── Public: stats extras for one match, or null ─────────────────────────
   detail = the football-data match detail ({home:{name}, away:{name}, date}) */
export async function buildMatchExtras(detail) {
  if (!BDL_KEY) return null;
  try {
    const bdlMatch = await findMatch(detail.home?.name, detail.away?.name, detail.utc || detail.date);
    if (!bdlMatch) return null;

    const stats = await bdl(`/team_match_stats?match_ids[]=${bdlMatch.id}&per_page=10`);
    const rows = stats.data || [];
    if (!rows.length) return null;

    // Map is_home, but re-check against canonical names in case home/away are swapped between providers
    let homeRow = rows.find(r => r.is_home), awayRow = rows.find(r => !r.is_home);
    if (canon(bdlMatch.home_team?.name) !== canon(detail.home?.name)) [homeRow, awayRow] = [awayRow, homeRow];
    if (!homeRow || !awayRow) return null;

    const pair = field => ({ home: num(homeRow[field]), away: num(awayRow[field]) });
    const extras = {
      source: 'balldontlie',
      possession: pair('possession_pct'),
      xg: pair('expected_goals'),
      shots: pair('shots_total'),
      shotsOnTarget: pair('shots_on_target'),
      bigChances: pair('big_chances'),
      corners: pair('corners'),
      fouls: pair('fouls'),
      yellowCards: pair('yellow_cards'),
      saves: pair('saves'),
      passesAccurate: pair('passes_accurate'),
      passesTotal: pair('passes_total'),
    };
    // If literally every value is null (stats not filed yet), report nothing
    const hasAny = Object.values(extras).some(v => v && typeof v === 'object' && (v.home != null || v.away != null));
    return hasAny ? extras : null;
  } catch (e) {
    console.warn('[extras-feed] unavailable:', e.message);
    return null;
  }
}
