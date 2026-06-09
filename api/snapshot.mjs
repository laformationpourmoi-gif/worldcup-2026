/* Vercel serverless function — FREE, no credit card required.
   GET /api/snapshot → live JSON snapshot from the free feed (football-data.org + RSS).
   Reuses the same builder as the Node server (../server/free-feed.js).
   Deploy: import this repo on vercel.com (no card on the Hobby plan). */
import { buildFreeSnapshot } from '../server/free-feed.js';

let cache = { data: null, ts: 0 };               // warm-instance cache only
const TTL = Number(process.env.CACHE_TTL_MS || 10 * 60 * 1000);

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('cache-control', 'no-store');
  try {
    const force = req.query?.refresh === '1';
    if (!force && cache.data && Date.now() - cache.ts < TTL) {
      return res.status(200).json({ ...cache.data, _cache: { hit: true, ageMs: Date.now() - cache.ts } });
    }
    const data = await buildFreeSnapshot();
    cache = { data, ts: Date.now() };
    res.status(200).json({ ...data, _cache: { hit: false } });
  } catch (e) {
    if (cache.data) return res.status(200).json({ ...cache.data, _cache: { hit: true, stale: true } });
    res.status(502).json({ error: String(e?.message || e) });
  }
}
