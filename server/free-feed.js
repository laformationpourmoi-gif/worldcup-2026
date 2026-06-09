/* ============================================================================
   WORLD CUP 2026 — FREE DATA FEED (no paid API, no tokens)
   ----------------------------------------------------------------------------
   Builds the SAME /api/snapshot JSON the AI feed produces, but from FREE sources:

     • Stats / standings / fixtures / scorers  →  football-data.org  (FREE key)
         Free tier: 10 req/min. Get a key at https://www.football-data.org/client/register
         The World Cup competition code is "WC". Set FOOTBALLDATA_KEY in .env.
     • News                                    →  public RSS feeds  (NO key at all)

   Degrades gracefully:
     - No FOOTBALLDATA_KEY  → stats are skipped (page keeps its embedded real
       data) and ONLY the news refreshes — still 100% free, zero keys.
     - A source fails       → that section is simply omitted from the snapshot,
       so the front-end keeps its embedded value for it.
   ============================================================================ */

const FD_BASE = 'https://api.football-data.org/v4';
// Accept several env-var names so it works whatever you called it on the host
// (Vercel won't let you rename a variable, so we match common spellings).
const FD_KEY  = process.env.FOOTBALLDATA_KEY || process.env.FootDataKey
             || process.env.FOOTDATA_KEY || process.env.FOOTBALL_DATA_KEY || '';

/* ── nation → emoji flag (covers football-data naming + common variants) ─── */
const FLAGS = {
  'argentina':'🇦🇷','australia':'🇦🇺','austria':'🇦🇹','algeria':'🇩🇿','belgium':'🇧🇪',
  'bosnia and herzegovina':'🇧🇦','bosniaherzegovina':'🇧🇦','brazil':'🇧🇷','canada':'🇨🇦','cape verde':'🇨🇻','cape verde islands':'🇨🇻','cabo verde':'🇨🇻',
  'colombia':'🇨🇴','croatia':'🇭🇷','curacao':'🇨🇼','czechia':'🇨🇿','czech republic':'🇨🇿',
  'dr congo':'🇨🇩','congo dr':'🇨🇩','ecuador':'🇪🇨','egypt':'🇪🇬','england':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','france':'🇫🇷',
  'germany':'🇩🇪','ghana':'🇬🇭','haiti':'🇭🇹','iran':'🇮🇷','ir iran':'🇮🇷','iraq':'🇮🇶',
  'ivory coast':'🇨🇮','cote divoire':'🇨🇮','japan':'🇯🇵','jordan':'🇯🇴','korea republic':'🇰🇷',
  'south korea':'🇰🇷','mexico':'🇲🇽','morocco':'🇲🇦','netherlands':'🇳🇱','new zealand':'🇳🇿',
  'norway':'🇳🇴','panama':'🇵🇦','paraguay':'🇵🇾','portugal':'🇵🇹','qatar':'🇶🇦','saudi arabia':'🇸🇦',
  'scotland':'🏴󠁧󠁢󠁳󠁣󠁴󠁿','senegal':'🇸🇳','south africa':'🇿🇦','spain':'🇪🇸','sweden':'🇸🇪',
  'switzerland':'🇨🇭','tunisia':'🇹🇳','turkey':'🇹🇷','turkiye':'🇹🇷','united states':'🇺🇸','usa':'🇺🇸',
  'uruguay':'🇺🇾','uzbekistan':'🇺🇿',
};

/* ── nation → FIFA rank (static, for the Featured Teams cards) ───────────── */
const RANK = {
  'spain':1,'argentina':2,'france':3,'england':4,'brazil':5,'portugal':6,'netherlands':7,
  'belgium':8,'germany':9,'croatia':10,'morocco':11,'colombia':13,'mexico':14,'united states':15,
  'usa':15,'uruguay':16,'switzerland':17,'japan':18,'senegal':19,'iran':20,'korea republic':22,
  'south korea':22,'ecuador':23,'austria':24,'australia':26,'turkey':27,'turkiye':27,'norway':29,
  'panama':30,'canada':31,'egypt':34,'algeria':35,'scotland':36,'paraguay':39,'tunisia':40,
  'ivory coast':42,'czechia':43,'uzbekistan':50,'qatar':51,'dr congo':56,'iraq':58,'saudi arabia':60,
  'south africa':61,'jordan':66,'cape verde':68,'cape verde islands':68,'cabo verde':68,'ghana':72,'bosnia and herzegovina':74,'bosniaherzegovina':74,
  'curacao':82,'haiti':84,'new zealand':86,
};

const CONTENDERS = ['Spain','Argentina','France','England','Brazil','Portugal','Netherlands',
  'Belgium','Germany','Croatia','Morocco'];
const HOSTS = ['Mexico','United States','Canada'];
const FAVORITES = new Set(['spain','argentina','france','england','brazil']);

const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
const flagOf = name => FLAGS[norm(name)] || '🏳️';
const rankOf = name => RANK[norm(name)] || 0;

/* ── football-data.org fetch helper ─────────────────────────────────────── */
async function fd(pathname) {
  const res = await fetch(`${FD_BASE}${pathname}`, { headers: { 'X-Auth-Token': FD_KEY } });
  if (!res.ok) throw new Error(`football-data ${pathname} → HTTP ${res.status}`);
  return res.json();
}

/* ── ET date/time formatting from a UTC ISO string ──────────────────────── */
const etTime = iso => new Intl.DateTimeFormat('en-GB',
  { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) + ' ET';
const etDate = iso => new Intl.DateTimeFormat('en-CA',
  { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

const GROUP_OF = g => {
  const s = String(g || '');
  const m = s.match(/^group[_\s-]*([A-L])$/i) || s.match(/^([A-L])$/i);  // "GROUP_A" | "Group A" | "A"
  return m ? m[1].toUpperCase() : null;
};
const STAGE = { LAST_16: 'R16', QUARTER_FINALS: 'QF', SEMI_FINALS: 'SF', THIRD_PLACE: '3P', FINAL: 'F' };
const matchStatus = s => (s === 'IN_PLAY' || s === 'PAUSED') ? 'live'
  : s === 'FINISHED' ? 'finished' : 'upcoming';

/* ── Build the stats half of the snapshot from football-data.org ────────── */
async function buildStats(out) {
  const [standings, matchesRes, scorersRes] = await Promise.all([
    fd('/competitions/WC/standings'),
    fd('/competitions/WC/matches'),
    fd('/competitions/WC/scorers?limit=12').catch(() => ({ scorers: [] })),
  ]);

  /* groups — dedupe by group letter, prefer the TOTAL table when several exist */
  const seenGroups = {};
  (standings.standings || []).forEach(s => {
    const name = GROUP_OF(s.group);
    if (!name || !(s.table || []).length) return;
    if (!seenGroups[name] || s.type === 'TOTAL') seenGroups[name] = s;
  });
  const groups = Object.values(seenGroups).map(s => ({
    name: GROUP_OF(s.group),
    status: s.table.some(t => t.playedGames > 0) ? 'ongoing' : 'upcoming',
    teams: s.table.map(t => ({
      name: t.team.name, flag: flagOf(t.team.name), rank: rankOf(t.team.name),
      pj: t.playedGames, g: t.won, n: t.draw, p: t.lost,
      gf: t.goalsFor, gc: t.goalsAgainst, pts: t.points,
      form: (t.form || '').split(/[,\s]+/).filter(Boolean).slice(-5),
    })),
  })).sort((a, b) => a.name.localeCompare(b.name));
  if (groups.length) out.groups = groups;

  /* matches — keep live + finished + the next ~12 upcoming */
  const all = (matchesRes.matches || []).map((m, i) => {
    const grp = GROUP_OF(m.group) || STAGE[m.stage] || (m.group || '?');
    const ft = m.score?.fullTime || {};
    const hasScore = ft.home != null && ft.away != null;
    return {
      id: m.id || i + 1, status: matchStatus(m.status), minute: m.minute || '',
      home: { name: m.homeTeam?.name || 'TBD', flag: flagOf(m.homeTeam?.name), rank: rankOf(m.homeTeam?.name) },
      away: { name: m.awayTeam?.name || 'TBD', flag: flagOf(m.awayTeam?.name), rank: rankOf(m.awayTeam?.name) },
      score: hasScore ? { home: ft.home, away: ft.away } : null,
      group: grp, date: etDate(m.utcDate), time: etTime(m.utcDate), venue: m.venue || '',
      _utc: m.utcDate,
    };
  });
  const live = all.filter(m => m.status === 'live');
  const finished = all.filter(m => m.status === 'finished').sort((a, b) => b._utc.localeCompare(a._utc)).slice(0, 6);
  const upcoming = all.filter(m => m.status === 'upcoming').sort((a, b) => a._utc.localeCompare(b._utc)).slice(0, 12);
  const matches = [...live, ...upcoming, ...finished].map(({ _utc, ...m }) => m);
  if (matches.length) {
    if (matches[0]) matches.find(m => m.group === 'A' && m.date === '2026-06-11') && (matches.find(m => m.group === 'A' && m.date === '2026-06-11').opener = true);
    out.matches = matches;
  }

  /* scorers + assisters */
  const sc = (scorersRes.scorers || []).map(s => ({
    name: s.player?.name || '—', flag: flagOf(s.team?.name), team: s.team?.name || '',
    goals: s.goals || 0, assists: s.assists || 0,
  }));
  if (sc.length) {
    out.scorers = sc.filter(p => p.goals > 0);
    out.assisters = sc.filter(p => p.assists > 0)
      .sort((a, b) => b.assists - a.assists)
      .map(p => ({ name: p.name, flag: p.flag, team: p.team, assists: p.assists, goals: p.goals }));
  }

  /* featured teams (contenders + hosts) enriched with live standings */
  const byName = {};
  groups.forEach(g => g.teams.forEach(t => { byName[norm(t.name)] = t; }));
  out.teams = [...CONTENDERS, ...HOSTS].map(name => {
    const t = byName[norm(name)] || {};
    return {
      name, flag: flagOf(name), rank: rankOf(name), group: '',
      pts: t.pts || 0, gf: t.gf || 0, ga: t.gc || 0, form: t.form || [],
      favorites: FAVORITES.has(norm(name)), host: HOSTS.map(norm).includes(norm(name)),
    };
  });

  /* tournament aggregates */
  const finishedAll = all.filter(m => m.status === 'finished' && m.score);
  const goals = finishedAll.reduce((n, m) => n + m.score.home + m.score.away, 0);
  const anyLive = live.length > 0;
  out.status = anyLive ? 'live' : (finishedAll.length >= 104 ? 'finished' : (finishedAll.length ? 'live' : 'pre'));
  out.tournament = {
    status: out.status,
    teams: 48, matches: 104, groups: 12, cities: 16, stadiums: 16, nations_hosting: 3,
    duration_days: 39, players: '1,100+',
    goalsTotal: goals,
    goalsAvg: finishedAll.length ? (goals / finishedAll.length).toFixed(1) : '—',
    topGoals: out.scorers?.[0]?.goals ?? '—',
    attendance: '—',
  };
}

/* ── News from free public RSS feeds (NO key) ───────────────────────────── */
//  `general: true` = non-football feed → keep only soccer items (SOCCER_RE).
const FEEDS = [
  { url: 'https://feeds.bbci.co.uk/sport/football/rss.xml',  lang: 'en', source: 'BBC Sport' },
  { url: 'https://www.lequipe.fr/rss/actu_rss_Football.xml', lang: 'fr', source: "L'Équipe" },
  { url: 'https://ici.radio-canada.ca/rss/4159',             lang: 'fr', source: 'Radio-Canada Sports', general: true },
];
// Case-sensitive on "Mondial": the tournament noun is capitalised ("Mondial : …",
// "Mondial de la FIFA"), whereas the adjective is lowercase ("rang mondial" = tennis).
const WC_RE     = /[Ww]orld\s?[Cc]up|[Cc]oupe du [Mm]onde|\bMondial\b/;
const SOCCER_RE = /soccer|football|coupe du monde|world\s?cup|\bfoot\b/i;  // no bare "mondial" (too loose in FR)
const COLORS = ['#0b3d2e', '#00285c', '#1b6b3a', '#2a0e3a', '#7a3b00', '#0a1a4a'];

function clean(s = '') {
  return s.replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
const tag = (block, t) => clean((block.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`, 'i')) || [])[1] || '');

async function fetchFeed({ url, lang, source, general }) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'wc26-dashboard/1.0' } });
    if (!res.ok) return [];
    const xml = await res.text();
    let items = xml.split(/<item[ >]/i).slice(1, 30).map(b => {
      const title = tag(b, 'title');
      const date = tag(b, 'pubDate');
      return {
        title, link: tag(b, 'link'), date,
        ts: Date.parse(date) || 0, lang, source,
      };
    }).filter(it => it.title);
    if (general) items = items.filter(it => SOCCER_RE.test(it.title)); // drop non-soccer from general feeds
    return items;
  } catch { return []; }
}

async function buildNews() {
  const lists = await Promise.all(FEEDS.map(fetchFeed));
  const items = lists.flat();
  if (!items.length) return null;

  // Prefer World-Cup-specific items; fall back to latest soccer news pre-tournament.
  const wc = items.filter(it => WC_RE.test(it.title));
  const pool = wc.length >= 4 ? wc : items;

  // Balance languages: interleave FR/EN so neither side dominates the feed.
  const byLang = { fr: [], en: [] };
  pool.sort((a, b) => b.ts - a.ts).forEach(it => byLang[it.lang === 'fr' ? 'fr' : 'en'].push(it));
  const picked = [];
  let fi = 0, ei = 0;
  while (picked.length < 6 && (fi < byLang.fr.length || ei < byLang.en.length)) {
    if (fi < byLang.fr.length) picked.push(byLang.fr[fi++]);
    if (picked.length < 6 && ei < byLang.en.length) picked.push(byLang.en[ei++]);
  }
  if (!picked.length) return null;

  return picked.map((it, i) => {
    const human = it.ts ? new Date(it.ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : it.date;
    const fr = it.lang === 'fr';
    return {
      id: i + 1, featured: i === 0, source: it.source, date: human,
      title_fr: fr ? it.title : it.title, title_en: it.title,   // single-language feed → mirror text
      excerpt_fr: '', excerpt_en: '',
      emoji: '⚽', color: COLORS[i % COLORS.length], url: it.link || '#',
    };
  });
}

/* ── Public entry point ─────────────────────────────────────────────────── */
export async function buildFreeSnapshot() {
  const out = { updatedAt: Date.now(), status: 'pre' };
  let gotSomething = false;

  if (FD_KEY) {
    try { await buildStats(out); gotSomething = true; }
    catch (e) { console.warn('[free-feed] stats unavailable:', e.message); }
  } else {
    console.log('[free-feed] No FOOTBALLDATA_KEY — refreshing NEWS only (still free). Add a free key for live stats.');
  }

  try {
    const news = await buildNews();
    if (news) { out.news = news; gotSomething = true; }
  } catch (e) { console.warn('[free-feed] news unavailable:', e.message); }

  if (!gotSomething) throw new Error('No free source returned data (check network / FOOTBALLDATA_KEY).');
  out.updatedAt = Date.now();
  return out;
}
