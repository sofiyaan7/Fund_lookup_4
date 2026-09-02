import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Serves /api/nifty-history from the dev server, mirroring the production
// Vercel function in api/nifty-history.js.
//
// Without this, `vite dev` had no server-side route at all, so the app fell
// back to a public CORS relay — and corsproxy.io answers 403 even from
// localhost, contrary to its own docs. The result was that every "Nifty 50
// return" figure read "n/a" in local development. Proxying here means the same
// same-origin path works in dev, on Vercel and on Netlify.
function niftyApiDevRoute() {
  const handler = () => async (_req, res) => {
    try {
      const period2 = Math.floor(Date.now() / 1000);
      const period1 = Math.floor(Date.UTC(2000, 0, 1) / 1000);
      const url =
        "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI" +
        `?period1=${period1}&period2=${period2}&interval=1d`;

      const upstream = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; fund-lookup/1.0)" },
      });
      const body = await upstream.text();
      res.statusCode = upstream.ok ? 200 : upstream.status;
      res.setHeader("Content-Type", "application/json");
      // Same one-day cache as production: the index only closes once a day.
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.end(
        upstream.ok
          ? body
          : JSON.stringify({
              error: `Yahoo Finance responded ${upstream.status}`,
            }),
      );
    } catch (e) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: String(e?.message || e) }));
    }
  };

  return {
    name: "nifty-api-dev-route",
    // `vite dev`
    configureServer(server) {
      server.middlewares.use("/api/nifty-history", handler());
    },
    // `vite preview` — so a locally served production build behaves like the
    // real deployment rather than losing the Nifty column.
    configurePreviewServer(server) {
      server.middlewares.use("/api/nifty-history", handler());
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), niftyApiDevRoute()],
});
