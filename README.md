# Fund & Manager Lookup

A dashboard over Indian mutual-fund manager history: look up a fund manager to
see every scheme they have run, or a fund to see its full manager lineage, with
NAV history, returns, AUM, flows and portfolio composition.

## Running it

```bash
npm install
npm run dev      # http://127.0.0.1:5173
npm run build    # -> dist/
npm run preview  # serve dist/ locally, including the /api route
npm run lint
```

## Where the data comes from

Nothing is baked into the JavaScript bundle. Every dataset is a JSON file under
`public/`, fetched at runtime — so **replacing a file refreshes the site with no
rebuild and no redeploy of the app code**.

| File | Contents |
| --- | --- |
| `fundHistory.json` | Manager tenure records — `{ s: scheme, i: inception, f: manager, fd: from, td: to }`. ~5,400 rows. |
| `fundMeta.json` | Per scheme: category, disclosed AUM (₹ crore), ISIN. |
| `composition.json` | Per scheme: holdings, sector and market-cap breakdown. |
| `aumHistory.json` | Month-end AUM series per scheme. |
| `benchmarkPrimary.json` | ISIN → official primary benchmark index name. |

`data_dump/build_app_data.py` regenerates `fundMeta.json`, `composition.json`
and `aumHistory.json` from the spreadsheets in `data_dump/`. `fundHistory.json`
comes from `FM_history_details.xlsx`, which is **not** checked in — regenerate
it to the schema above if you refresh the tenure records.

### "As at" dates are read from the data, never from the clock

`fundHistory.json` carries `_meta.asOf`, and `src/utils.js` derives every
"is this manager still running this fund?" answer from the dataset itself: a
tenure is current when it runs to the latest month recorded **for that fund**.

This matters. The previous rule was `now - toDate < 120 days`, which meant the
whole app quietly went inert 120 days after each data refresh — with most
tenures stamped `2026-04-30`, every manager became "not currently active" on
2026-08-28 and 1,015 of 1,095 funds reported "no current manager". Drop in a
newer dump and the site simply moves forward; leave the old one in and it keeps
telling the truth about the date it describes.

## Live market data

- **NAV history and returns** — `api.mfapi.in` (mirrors official AMFI NAV data),
  fetched client-side. A scheme is matched to AMFI **by ISIN**: the app pulls
  `api.mfapi.in/mf` once (the full ~37,800-scheme list, which carries ISINs),
  indexes it, and looks the ISIN up directly. No ISIN match means no number is
  shown — figures are computed from NAVs, never quoted from unverifiable text.
- **Nifty 50 index** — Yahoo Finance (`^NSEI`), always through the same-origin
  route `/api/nifty-history`, because Yahoo sends no CORS headers:

  | Environment | Implementation |
  | --- | --- |
  | Vercel | `api/nifty-history.js` |
  | Netlify | `netlify/functions/nifty-history.js` |
  | `vite dev` / `vite preview` | middleware in `vite.config.js` |

  There is deliberately no public-CORS-relay fallback. The old one
  (corsproxy.io) returns 403 even from localhost despite documenting the
  opposite, which silently blanked the entire Nifty column; a missing route is
  now a reportable error instead.

## Deep links

`/fund/<Scheme%20Name>` and `/manager/<Manager%20Name>` both work, as do
`?fund=` / `?manager=` query parameters for hosts that cannot build path
segments. Name matching is case- and whitespace-insensitive. Both hosts are
configured to serve `index.html` for unknown paths while leaving `/api/*` alone.
