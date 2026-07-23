// Vercel serverless function: proxies the Yahoo Finance chart API for the
// Nifty 50 index (^NSEI) server-side.
//
// Why this exists: Yahoo Finance's endpoint sends no CORS headers, so the
// browser can't call it directly. In local dev the app falls back to a
// public CORS relay (corsproxy.io) — but that relay's free tier explicitly
// blocks any non-localhost origin ("Free usage is limited to localhost and
// development environments"), so it 403s in production. Since this fetch
// happens server-to-server here, CORS doesn't apply and no third-party relay
// is needed at all once deployed on Vercel.
export default async function handler(req, res) {
  try {
    const period2 = Math.floor(Date.now() / 1000);
    const period1 = Math.floor(Date.UTC(2000, 0, 1) / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?period1=${period1}&period2=${period2}&interval=1d`;

    const upstream = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; fund-lookup/1.0)" },
    });
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Yahoo Finance responded ${upstream.status}` });
      return;
    }

    const data = await upstream.json();
    // Cache at Vercel's edge for a day — the index only moves once a day
    // (daily closes), so there's no reason to re-fetch upstream more often.
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=3600");
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e) });
  }
}
