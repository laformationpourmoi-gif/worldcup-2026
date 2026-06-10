/* Vercel serverless function — FREE per-match detail.
   GET /api/match?id=<footballDataMatchId>
   → goals (scorer + minute), bookings (cards), referee, score by period.
   Uses the same free football-data key (FootDataKey / FOOTBALLDATA_KEY). */
import { buildMatchDetail } from '../server/free-feed.js';

const cache = new Map();              // per-match warm cache
const TTL = 10 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('cache-control', 'no-store');
  const id = String(req.query?.id || '').replace(/\D/g, '');
  if (!id) return res.status(400).json({ error: 'missing match id' });

  const hit = cache.get(id);
  if (hit && Date.now() - hit.ts < TTL) return res.status(200).json(hit.data);

  try {
    const data = await buildMatchDetail(id);
    cache.set(id, { data, ts: Date.now() });
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e) });
  }
}
