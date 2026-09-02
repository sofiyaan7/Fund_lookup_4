// Live market-data layer.
//
// Sources:
//   - NAV history: api.mfapi.in (mirrors official AMFI NAV data) — CORS-open,
//     fetched client-side directly.
//   - Nifty 50 index history: Yahoo Finance (^NSEI), proxied server-side
//     because Yahoo sends no CORS headers (see api/nifty-history.js and the
//     matching Vite dev middleware in vite.config.js).
//
// Verifiability rule: a figure is only shown when the remote scheme is VERIFIED
// BY ISIN against our own records (public/fundMeta.json carries the ISIN for
// every scheme). No ISIN match → no number. Returns are *computed* from NAV
// values over the manager's tenure window — never quoted from unverifiable text.
//
// How a scheme is resolved: api.mfapi.in/mf returns the FULL scheme list
// (~37,800 rows) with isinGrowth / isinDivReinvestment on every row, in one
// request. We fetch that once and look our ISIN up directly. The previous
// approach — search mfapi by scheme name, then fetch up to 8 candidates and
// check each one's ISIN — resolved only ~78% of funds because the dataset
// abbreviates names that AMFI spells out ("Canara Rob" vs "Canara Robeco",
// "Largecap" vs "Large Cap", "ETF" vs "Exchange Traded Fund") and mfapi's
// search is a literal substring match. Direct ISIN lookup resolves 1070 of
// 1095 funds (97.7%) and replaces ~126 requests per manager page with one.

const MFAPI = "https://api.mfapi.in";
// Yahoo's chart endpoint is reached only through our own /api/nifty-history
// route (Vercel function, Netlify function, or Vite dev middleware) — never
// from the browser, since Yahoo sends no CORS headers.
//
// There is deliberately no public-CORS-relay fallback any more. The old one
// (corsproxy.io) answers 403 even from localhost despite documenting the
// opposite, so it silently made every Nifty 50 figure read "n/a"; the other
// free relays are no more dependable. A missing same-origin route is now a
// clear, reportable configuration error instead of a silent blank column.

const DAY = 86400000;

/* ── small fetch pool + caches ─────────────────────────────────────────── */

let inFlight = 0;
const queue = [];
function pump() {
  while (inFlight < 4 && queue.length) {
    const { fn, res, rej } = queue.shift();
    inFlight += 1;
    fn()
      .then(res, rej)
      .finally(() => {
        inFlight -= 1;
        pump();
      });
  }
}
function limited(fn) {
  return new Promise((res, rej) => {
    queue.push({ fn, res, rej });
    pump();
  });
}

const jsonMemo = new Map(); // url -> Promise
function getJSON(url) {
  if (!jsonMemo.has(url)) {
    jsonMemo.set(
      url,
      limited(() =>
        fetch(url).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
      ).catch((e) => {
        jsonMemo.delete(url); // allow retry on next mount
        throw e;
      })
    );
  }
  return jsonMemo.get(url);
}

function lsGet(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}
function lsSet(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* storage full/blocked — cache is best-effort */
  }
}

// Merge a patch into a stored map, RE-READING immediately before the write.
//
// Read-modify-write on localStorage is what broke the old caches: every row on
// a manager page resolves concurrently, each captured its own snapshot of the
// map, and the last writer clobbered all the others. Measured: the cache grew
// by exactly one entry per page load (3 → 4 → 5 → 6 → 7), so a page kept making
// ~126 requests on every visit no matter how often it was opened.
function lsMerge(key, patch) {
  const cur = lsGet(key);
  Object.assign(cur, patch);
  lsSet(key, cur);
  return cur;
}

const LS_ISIN_INDEX = "live.isinIndex.v1"; // { at, map: { isin: code } }
const LS_CODES = "live.mfapiCodes.v2"; // isin -> mfapi scheme code (resolved)
const LS_MISSES = "live.mfapiMisses.v1"; // isin -> ts of last failed resolve
const LS_NIFTY = "live.niftyNav.v1"; // { points:[{t,nav}], firstT, lastT, at }
const LS_BENCH_PROXY = "live.benchProxyList.v3"; // benchmark name -> [code, ...]
const LS_BENCH_BEST = "live.benchProxyBest.v1"; // benchmark name -> chosen code

const INDEX_TTL = 7 * DAY; // AMFI's scheme list changes slowly
const MISS_TTL = DAY; // don't re-probe a fund that has no AMFI match all day

/* ── name utilities (fallback path only) ───────────────────────────────── */

function cleanName(scheme) {
  return scheme
    .replace(/-(Reg|Dir|Direct)\((G|IDCW|D|DP|DR)\)\s*$/i, "")
    .replace(/\((G|IDCW|D|DP|DR)\)\s*$/i, "")
    .replace(/-(Reg|Dir|Direct)\s*$/i, "")
    .trim();
}

// The dataset abbreviates names that AMFI spells out in full. Expanding them
// only matters for the name-search fallback now that ISIN lookup is primary,
// but it still rescues the handful of schemes missing from the ISIN index.
const NAME_EXPANSIONS = [
  [/\bICICI Pru\b/gi, "ICICI Prudential"],
  [/\bAditya Birla SL\b/gi, "Aditya Birla Sun Life"],
  [/\bABSL\b/gi, "Aditya Birla Sun Life"],
  [/\bCanara Rob\b/gi, "Canara Robeco"],
  [/\bWOC\b/gi, "WhiteOak Capital"],
  [/\bTRUSTMF\b/gi, "TRUST Mutual Fund"],
  [/\bFin Serv\b/gi, "Financial Services"],
  [/\bIntl\.?\b/gi, "International"],
  [/\bOpp\b/gi, "Opportunities"],
  [/\bSmallcap\b/gi, "Small Cap"],
  [/\bMidcap\b/gi, "Mid Cap"],
  [/\bLargecap\b/gi, "Large Cap"],
  [/\bFlexicap\b/gi, "Flexi Cap"],
  [/\bMulticap\b/gi, "Multi Cap"],
  [/\bMidcap(\d)/gi, "Midcap $1"],
];

function expandName(name) {
  return NAME_EXPANSIONS.reduce((n, [re, to]) => n.replace(re, to), name).replace(/\s+/g, " ").trim();
}

function wantsDirect(scheme) {
  return /-Dir(ect)?\(/i.test(scheme) || /\bDirect\b/i.test(scheme);
}

function tokenScore(query, candidate) {
  const toks = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (!toks.length) return 0;
  const c = candidate.toLowerCase();
  let hit = 0;
  toks.forEach((t) => {
    if (c.includes(t)) hit += 1;
  });
  return hit / toks.length;
}

/* ── the ISIN index ────────────────────────────────────────────────────── */

let indexPromise = null;

// isin -> mfapi scheme code, for every scheme AMFI publishes a NAV for.
export function loadIsinIndex() {
  if (indexPromise) return indexPromise;

  const cached = lsGet(LS_ISIN_INDEX);
  if (cached.map && cached.at && Date.now() - cached.at < INDEX_TTL) {
    indexPromise = Promise.resolve(cached.map);
    return indexPromise;
  }

  indexPromise = getJSON(`${MFAPI}/mf`)
    .then((rows) => {
      const map = {};
      (rows || []).forEach((r) => {
        // Growth ISINs win: that's the option our records carry for most
        // schemes, and it's the series the returns should be computed off.
        if (r.isinGrowth && !map[r.isinGrowth]) map[r.isinGrowth] = r.schemeCode;
        if (r.isinDivReinvestment && !map[r.isinDivReinvestment])
          map[r.isinDivReinvestment] = r.schemeCode;
      });
      if (!Object.keys(map).length) throw new Error("empty AMFI scheme index");
      lsSet(LS_ISIN_INDEX, { at: Date.now(), map });
      return map;
    })
    .catch((e) => {
      indexPromise = null; // allow retry
      // A stale cached index is far better than none.
      if (cached.map) return cached.map;
      throw e;
    });
  return indexPromise;
}

/* ── NAV history (mfapi.in) ────────────────────────────────────────────── */

// code -> { isinG, isinD, points:[{t,nav}] ascending, firstT, lastT, name }
async function fetchNav(code) {
  const d = await getJSON(`${MFAPI}/mf/${code}`);
  const points = (d.data || [])
    .map((p) => {
      const [dd, mm, yyyy] = p.date.split("-").map(Number);
      return { t: Date.UTC(yyyy, mm - 1, dd), nav: parseFloat(p.nav) };
    })
    .filter((p) => Number.isFinite(p.nav) && p.nav > 0)
    .sort((a, b) => a.t - b.t);
  if (!points.length) throw new Error("empty NAV history");
  return {
    code,
    name: d.meta?.scheme_name || "",
    isinG: d.meta?.isin_growth || null,
    isinD: d.meta?.isin_div_reinvestment || null,
    points,
    firstT: points[0].t,
    lastT: points[points.length - 1].t,
  };
}

// Fallback for the few ISINs absent from the index: search by name, then
// verify the ISIN exactly as before. Never accepts an unverified match.
async function resolveByName(scheme, isin) {
  const q = expandName(cleanName(scheme));
  const results = (await getJSON(`${MFAPI}/mf/search?q=${encodeURIComponent(q)}`)) || [];
  const direct = wantsDirect(scheme);
  const planMatched = results.filter((x) => direct === /direct/i.test(x.schemeName));
  const growthish = planMatched.filter((x) => /growth|cumulative/i.test(x.schemeName));
  const pool = growthish.length ? growthish : planMatched.length ? planMatched : results;
  const candidates = [...pool]
    .sort(
      (a, b) =>
        tokenScore(q, b.schemeName) - tokenScore(q, a.schemeName) ||
        a.schemeName.length - b.schemeName.length
    )
    .slice(0, 8);

  for (const c of candidates) {
    try {
      const nav = await fetchNav(c.schemeCode);
      if (nav.isinG === isin || nav.isinD === isin) return nav;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

// In-flight de-duplication. A single manager page mounts several cells for the
// same fund (tenure return, net-flow estimate, …); without this each one starts
// its own resolve.
const navMemo = new Map(); // `${scheme}|${isin}` -> Promise

// Resolve a scheme (by our ISIN) to an ISIN-verified NAV history.
export function resolveNav(scheme, isin) {
  if (!isin) return Promise.reject(new Error("no ISIN in records"));
  const key = `${scheme}|${isin}`;
  if (navMemo.has(key)) return navMemo.get(key);

  const p = (async () => {
    // A recent failure is remembered so a fund with no AMFI match doesn't
    // re-run the whole search on every page view.
    const misses = lsGet(LS_MISSES);
    if (misses[isin] && Date.now() - misses[isin] < MISS_TTL) {
      throw new Error("no ISIN-verified AMFI match");
    }

    const codes = lsGet(LS_CODES);
    if (codes[isin]) {
      try {
        const nav = await fetchNav(codes[isin]);
        if (nav.isinG === isin || nav.isinD === isin) return nav;
      } catch {
        /* stale code — fall through and re-resolve */
      }
    }

    // Primary path: one shared ISIN index, no per-fund searching.
    try {
      const index = await loadIsinIndex();
      const code = index[isin];
      if (code) {
        const nav = await fetchNav(code);
        if (nav.isinG === isin || nav.isinD === isin) {
          lsMerge(LS_CODES, { [isin]: code });
          return nav;
        }
      }
    } catch {
      /* index unavailable — try the name search below */
    }

    // Fallback: name search + ISIN verification.
    const byName = await resolveByName(scheme, isin);
    if (byName) {
      lsMerge(LS_CODES, { [isin]: byName.code });
      return byName;
    }

    lsMerge(LS_MISSES, { [isin]: Date.now() });
    throw new Error("no ISIN-verified AMFI match");
  })();

  navMemo.set(key, p);
  p.catch(() => navMemo.delete(key)); // let a later mount retry
  return p;
}

// Latest NAV point on/before `t` (ms). Returns null if none within the window.
export function navOn(nav, t, lookbackDays = 31) {
  const pts = nav.points;
  if (t < pts[0].t) return null;
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (pts[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  const p = pts[lo];
  if (t - p.t > lookbackDays * DAY) return null;
  return p;
}

// Return over [fromISO, toISO] ("YYYY-MM-DD"); for active funds pass toISO=null
// to use the latest NAV. AMFI online history begins ~Apr 2006, so windows that
// start earlier are clamped to the first available NAV (flagged `clamped`).
export function windowReturn(nav, fromISO, toISO) {
  const fromReq = Date.parse(fromISO + "T00:00:00Z");
  let start = navOn(nav, fromReq);
  let clamped = false;
  if (!start) {
    if (nav.firstT > fromReq) {
      start = nav.points[0];
      clamped = true;
    } else return null;
  }
  const end = toISO
    ? navOn(nav, Date.parse(toISO + "T00:00:00Z"))
    : nav.points[nav.points.length - 1];
  if (!end || end.t <= start.t) return null;

  const days = (end.t - start.t) / DAY;
  const abs = end.nav / start.nav - 1;
  const cagr = days >= 365 ? Math.pow(end.nav / start.nav, 365.25 / days) - 1 : null;
  return { abs, cagr, days, fromT: start.t, toT: end.t, clamped };
}

/* ── official primary benchmark (Benchmark_All_Funds.xlsx) ────────────── */
//
// public/benchmarkPrimary.json maps a scheme's ISIN to its SD_Benchmark Index
// (Primary row only). Raw index levels aren't independently fetchable, so the
// return shown is that of an AMFI index fund tracking the same index — best
// name match, cached by benchmark name so the search runs once per index.

const BENCH_STOPWORDS = new Set([
  "fund", "index", "plan", "direct", "dir", "regular", "reg", "growth", "g",
  "idcw", "dividend", "reinvestment", "payout", "option", "the", "of", "and", "etf",
]);

function benchSigTokens(name) {
  return name
    .toLowerCase()
    .replace(/-\s*tri\s*$/i, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !BENCH_STOPWORDS.has(t));
}

// Rank every candidate in `pool` that matches `qToks` — every benchmark word
// must appear in the name (hard requirement); among matches, fewer leftover
// words wins (closest name), then a preference for non-IDCW + regular-plan
// naming as a tiebreaker only. "Growth" is NOT a hard filter — some
// single-option schemes have no "Growth" in their name at all.
function rankBenchCandidates(qToks, pool) {
  return pool
    .map((x) => {
      const cToks = benchSigTokens(x.schemeName);
      const cSet = new Set(cToks);
      const hits = qToks.filter((t) => cSet.has(t)).length;
      if (hits < qToks.length) return null;
      const extra = cToks.length - hits;
      const bonus =
        (/regular|reg\b/i.test(x.schemeName) ? 1 : 0) +
        (/growth/i.test(x.schemeName) ? 1 : 0) -
        (/idcw|dividend/i.test(x.schemeName) ? 2 : 0);
      return { code: x.schemeCode, extra, bonus };
    })
    .filter(Boolean)
    .sort((a, b) => a.extra - b.extra || b.bonus - a.bonus)
    .map((r) => r.code);
}

async function searchMfapi(q) {
  try {
    return (await getJSON(`${MFAPI}/mf/search?q=${encodeURIComponent(q)}`)) || [];
  } catch {
    return [];
  }
}

const benchMemo = new Map(); // benchmark name -> Promise<code[]>

function findBenchmarkProxyCandidates(benchmarkName) {
  if (benchMemo.has(benchmarkName)) return benchMemo.get(benchmarkName);

  const p = (async () => {
    const cache = lsGet(LS_BENCH_PROXY);
    if (benchmarkName in cache) return cache[benchmarkName];

    const cleaned = benchmarkName.replace(/-\s*TRI\s*$/i, "").trim();
    const qToks = benchSigTokens(cleaned);
    let codes = [];

    if (qToks.length) {
      const results = await searchMfapi(`${cleaned} Index Fund`);
      codes = rankBenchCandidates(qToks, results);

      // Some sector/thematic indices are only tracked by an ETF.
      if (!codes.length) {
        const etfResults = await searchMfapi(`${cleaned} ETF`);
        codes = rankBenchCandidates(qToks, etfResults);
      }
    }

    lsMerge(LS_BENCH_PROXY, { [benchmarkName]: codes });
    return codes;
  })();

  benchMemo.set(benchmarkName, p);
  p.catch(() => benchMemo.delete(benchmarkName));
  return p;
}

// The proxy actually chosen for a benchmark, resolved once and reused.
//
// The closest NAME match for a benchmark is often a fund that only launched in
// 2023-24 and so covers nothing for an older manager tenure. That is why
// candidates are walked at all — but walking them *per row* meant re-fetching
// every candidate's NAV history on every page view (95 NAV requests on one
// manager page, on every visit). Instead: evaluate the shortlist once, keep the
// proxy with the longest history, and reuse it for every window.
const PROXY_SHORTLIST = 4;
const proxyMemo = new Map(); // benchmark name -> Promise<nav | null>

function bestBenchmarkProxy(benchmarkName) {
  if (proxyMemo.has(benchmarkName)) return proxyMemo.get(benchmarkName);

  const p = (async () => {
    // Which candidate won is remembered across sessions, so the shortlist is
    // only ever walked once per benchmark per browser rather than on every
    // page load.
    const chosen = lsGet(LS_BENCH_BEST)[benchmarkName];
    if (chosen) {
      try {
        return await fetchNav(chosen);
      } catch {
        /* stale code — re-evaluate below */
      }
    }

    const codes = await findBenchmarkProxyCandidates(benchmarkName);
    if (!codes.length) return null;

    let best = null;
    for (const code of codes.slice(0, PROXY_SHORTLIST)) {
      try {
        const nav = await fetchNav(code);
        // Longest history wins: it covers the widest set of tenure windows,
        // and every candidate here already tracks the same index.
        if (!best || nav.firstT < best.firstT) best = nav;
      } catch {
        /* try the next candidate */
      }
    }
    if (best) lsMerge(LS_BENCH_BEST, { [benchmarkName]: best.code });
    return best;
  })();

  proxyMemo.set(benchmarkName, p);
  p.catch(() => proxyMemo.delete(benchmarkName));
  return p;
}

// Primary-benchmark return over a fund's tenure window (toISO=null → latest).
export async function primaryBenchmarkReturn(benchmarkName, fromISO, toISO) {
  if (!benchmarkName) throw new Error("no primary benchmark on record for this fund");
  const nav = await bestBenchmarkProxy(benchmarkName);
  if (!nav) throw new Error("no AMFI index-fund proxy found for this benchmark");
  const r = windowReturn(nav, fromISO, toISO);
  if (!r) throw new Error("no candidate proxy has NAV history covering this window");
  return r;
}

/* ── Nifty 50 index history (Yahoo Finance) ────────────────────────────── */

// Full ^NSEI daily-close history, fetched once and cached for a day (index
// closes don't change again once the market shuts). Shaped like a NAV series
// ({ points, firstT, lastT }) so it can be run through the same windowReturn
// used for fund tenure returns.
//
// Fetch path: our own same-origin /api/nifty-history — a Vercel function in
// production, a Vite middleware in dev (vite.config.js), a Netlify function on
// Netlify. Public CORS relays are only a last resort; they are not dependable
// (corsproxy.io returns 403 even from localhost despite documenting the
// opposite, which is why every Nifty figure read "n/a" locally).
async function fetchYahooNiftyChart() {
  let detail = "";
  try {
    const r = await fetch("/api/nifty-history");
    if (r.ok) {
      const data = await r.json();
      if (data?.chart) return data;
      detail = data?.error ? ` (${data.error})` : " (unexpected response shape)";
    } else {
      detail = ` (HTTP ${r.status})`;
    }
  } catch (e) {
    detail = ` (${e?.message || e})`;
  }
  throw new Error(
    `/api/nifty-history is not serving Yahoo Finance data${detail}. ` +
      "It is provided by api/nifty-history.js on Vercel, " +
      "netlify/functions/nifty-history.js on Netlify, and the Vite dev middleware locally."
  );
}

let niftyPromise = null;
function fetchNiftyNav() {
  if (!niftyPromise) {
    niftyPromise = (async () => {
      const cached = lsGet(LS_NIFTY);
      if (cached.points && Date.now() - cached.at < DAY) return cached;

      const d = await fetchYahooNiftyChart();
      const res = d?.chart?.result?.[0];
      if (!res) throw new Error("no Yahoo Finance data for Nifty 50");

      const ts = res.timestamp || [];
      const closes = res.indicators?.quote?.[0]?.close || [];
      const points = ts
        .map((t, i) => ({ t: t * 1000, nav: closes[i] }))
        .filter((p) => Number.isFinite(p.nav) && p.nav > 0)
        .sort((a, b) => a.t - b.t);
      if (!points.length) throw new Error("empty Nifty 50 history");

      const entry = {
        points,
        firstT: points[0].t,
        lastT: points[points.length - 1].t,
        at: Date.now(),
      };
      lsSet(LS_NIFTY, entry);
      return entry;
    })().catch((e) => {
      niftyPromise = null;
      // Serve a stale cached series rather than showing nothing at all.
      const cached = lsGet(LS_NIFTY);
      if (cached.points?.length) return cached;
      throw e;
    });
  }
  return niftyPromise;
}

// Nifty 50 return over the same [fromISO, toISO] window as a fund's tenure
// return (toISO=null → latest close). Source: Yahoo Finance (^NSEI).
export async function niftyReturn(fromISO, toISO) {
  const nav = await fetchNiftyNav();
  return windowReturn(nav, fromISO, toISO);
}

/* ── fund snapshot (for the full fund page) ────────────────────────────── */

// Point-in-time returns off the latest NAV: 1Y/3Y/5Y and since first
// available NAV. All computed from the same ISIN-verified history.
export function snapshotReturns(nav) {
  const pts = nav.points;
  const last = pts[pts.length - 1];

  const over = (days) => {
    const target = last.t - days * DAY;
    if (target < nav.firstT) return null;
    const p = navOn(nav, target);
    if (!p || p.t >= last.t) return null;
    const d = (last.t - p.t) / DAY;
    const abs = last.nav / p.nav - 1;
    return { abs, cagr: d >= 365 ? Math.pow(last.nav / p.nav, 365.25 / d) - 1 : null };
  };

  const first = pts[0];
  const dSI = (last.t - first.t) / DAY;
  const si =
    dSI > 0
      ? {
          abs: last.nav / first.nav - 1,
          cagr: dSI >= 365 ? Math.pow(last.nav / first.nav, 365.25 / dSI) - 1 : null,
          sinceT: first.t,
        }
      : null;

  return { latest: last, r1: over(365), r3: over(3 * 365), r5: over(5 * 365), si };
}

/* ── formatting helpers ────────────────────────────────────────────────── */

export function fmtPct(x, digits = 1) {
  if (x == null || !Number.isFinite(x)) return "—";
  const v = x * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function fmtNavDate(t) {
  return new Date(t).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
