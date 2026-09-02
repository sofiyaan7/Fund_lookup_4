// Netlify equivalent of api/nifty-history.js (Vercel) and the Vite dev
// middleware. All three answer the same same-origin path, /api/nifty-history,
// so the client never has to know which host it is on — and never has to fall
// back to a public CORS relay, which is what made every Nifty 50 figure read
// "n/a" outside Vercel.
export default async function handler() {
  try {
    const period2 = Math.floor(Date.now() / 1000);
    const period1 = Math.floor(Date.UTC(2000, 0, 1) / 1000);
    const url =
      "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI" +
      `?period1=${period1}&period2=${period2}&interval=1d`;

    const upstream = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; fund-lookup/1.0)" },
    });
    if (!upstream.ok) {
      return Response.json(
        { error: `Yahoo Finance responded ${upstream.status}` },
        { status: upstream.status }
      );
    }
    return new Response(await upstream.text(), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // The index only closes once a day.
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
      },
    });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 502 });
  }
}

export const config = { path: "/api/nifty-history" };
