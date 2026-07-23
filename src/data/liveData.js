// Live market-data layer.
//
// Sources:
//   - NAV history: api.mfapi.in (mirrors official AMFI NAV data) — CORS-open,
//     fetched client-side directly.
//   - Nifty 50 index history: Yahoo Finance (^NSEI) — Yahoo's endpoint has no
//     CORS headers, so requests go through a public CORS-relay proxy.
//
// Verifiability rule: a figure is only shown when the remote scheme is
// VERIFIED BY ISIN against our own records (public/fundMeta.json carries the
// ISIN for every scheme). No ISIN match → no number. Returns are *computed*
// from NAV values over the manager's tenure window — never quoted from
// unverifiable text.

const MFAPI = "https://api.mfapi.in";
const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI";
const CORS_RELAY = "https://corsproxy.io/?url=";

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

const LS_CODES = "live.mfapiCodes.v1"; // isin -> mfapi scheme code
const LS_NIFTY = "live.niftyNav.v1"; // { points:[{t,nav}], firstT, lastT, at }

/* ── name utilities ────────────────────────────────────────────────────── */

function cleanName(scheme) {
  return scheme
    .replace(/-(Reg|Dir|Direct)\((G|IDCW|D|DP|DR)\)\s*$/i, "")
    .replace(/\((G|IDCW|D|DP|DR)\)\s*$/i, "")
    .replace(/-(Reg|Dir|Direct)\s*$/i, "")
    .trim();
}

// Our dataset abbreviates some names that AMFI/mfapi spells out in full.
// Without expanding them the name search returns nothing (or the wrong fund)
// and the scheme never resolves — e.g. our "ICICI Pru …" vs AMFI's "ICICI
// Prudential …". Scoped to ICICI so no other AMC's lookup is affected.
function expandAmcAbbrev(name) {
  if (!/\bICICI Pru\b/i.test(name)) return name;
  return name
    .replace(/\bICICI Pru\b/gi, "ICICI Prudential")
    .replace(/\bFin Serv\b/gi, "Financial Services")
    .replace(/\bOpp\b/gi, "Opportunities")
    .replace(/\bValue Fund\b/gi, "Value Discovery Fund");
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

// Resolve a scheme (by name + our ISIN) to an ISIN-verified NAV history.
export async function resolveNav(scheme, isin) {
  if (!isin) throw new Error("no ISIN in records");
  const codes = lsGet(LS_CODES);
  if (codes[isin]) return fetchNav(codes[isin]);

  const q = expandAmcAbbrev(cleanName(scheme));
  const results = (await getJSON(`${MFAPI}/mf/search?q=${encodeURIComponent(q)}`)) || [];
  const direct = wantsDirect(scheme);
  // Prefer the right plan (regular vs direct), then the growth option — index
  // funds and ETFs label their growth option "Growth", "Cumulative" or leave it
  // implicit, so fall back progressively instead of dropping the scheme. Rank
  // whatever pool we use by name overlap; the ISIN check below guarantees we
  // only ever accept the correct fund.
  const planMatched = results.filter((x) => direct === /direct/i.test(x.schemeName));
  const growthish = planMatched.filter((x) => /growth|cumulative/i.test(x.schemeName));
  const pool = growthish.length ? growthish : planMatched.length ? planMatched : results;
  // Rank by query-token overlap, then prefer the closest-length name so an exact
  // match (e.g. "Nifty 100 ETF") beats a superset ("Nifty 100 Low Volatility 30
  // ETF") that also contains every query token.
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
      if (nav.isinG === isin || nav.isinD === isin) {
        codes[isin] = c.schemeCode;
        lsSet(LS_CODES, codes);
        return nav;
      }
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error("no ISIN-verified AMFI match");
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

/* ── benchmarks (index-fund NAVs as TRI proxies) ───────────────────────── */

// Codes verified against mfapi. Index *funds* are used as investable proxies
// for the index (their NAV is net of a small tracking cost).
export const BENCHMARKS = [
  { key: "n50", label: "Nifty 50", proxy: "UTI Nifty 50 Index Fund (Reg-G)", code: 100822 },
  { key: "n500", label: "Nifty 500", proxy: "Motilal Oswal Nifty 500 Index Fund (Reg)", code: 147626 },
  { key: "sensex", label: "BSE Sensex", proxy: "HDFC BSE Sensex Index Fund (G)", code: 101281 },
  { key: "mid150", label: "Nifty Midcap 150", proxy: "Motilal Oswal Nifty Midcap 150 Index Fund (Reg)", code: 147621 },
];

// Benchmark return over an exact ms window (match the fund's actual NAV window).
export async function benchmarkReturn(code, fromT, toT) {
  const nav = await fetchNav(code);
  const start = navOn(nav, fromT);
  const end = navOn(nav, toT) || (toT >= nav.lastT ? nav.points[nav.points.length - 1] : null);
  if (!start || !end || end.t <= start.t) return null;
  const days = (end.t - start.t) / DAY;
  const abs = end.nav / start.nav - 1;
  const cagr = days >= 365 ? Math.pow(end.nav / start.nav, 365.25 / days) - 1 : null;
  return { abs, cagr, days, fromT: start.t, toT: end.t };
}

/* ── official primary benchmark (Benchmark_All_Funds.xlsx) ────────────── */
//
// public/benchmarkPrimary.json maps a scheme's ISIN to its SD_Benchmark Index
// (Primary row only), sourced from data_dump/Benchmark_All_Funds.xlsx. Raw
// index levels aren't independently fetchable, so the return shown is that of
// an AMFI index fund tracking the same index — best name match, cached by
// benchmark name so the search only runs once per index.

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
// single-option schemes have no "Growth" in their name at all (e.g. "Motilal
// Oswal Nifty 500 Index Fund - Regular Plan") and would be wrongly dropped.
// Returns every qualifying scheme code, best match first.
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

const LS_BENCH_PROXY = "live.benchProxyList.v2"; // benchmark name -> [mfapi scheme code, ...]

async function findBenchmarkProxyCandidates(benchmarkName) {
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

  cache[benchmarkName] = codes;
  lsSet(LS_BENCH_PROXY, cache);
  return codes;
}

// Primary-benchmark return over a fund's tenure window (toISO=null → latest).
// Walks the ranked proxy candidates and returns the first whose NAV history
// actually overlaps the window — the closest NAME match for a benchmark is
// often a fund that only launched in 2023-24, which covers nothing for an
// older manager tenure; a looser-matched but longer-running proxy is tried
// next rather than giving up after one attempt.
export async function primaryBenchmarkReturn(benchmarkName, fromISO, toISO) {
  if (!benchmarkName) throw new Error("no primary benchmark on record for this fund");
  const codes = await findBenchmarkProxyCandidates(benchmarkName);
  if (!codes.length) throw new Error("no AMFI index-fund proxy found for this benchmark");
  for (const code of codes) {
    try {
      const nav = await fetchNav(code);
      const r = windowReturn(nav, fromISO, toISO);
      if (r) return r;
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error("no candidate proxy has NAV history covering this window");
}

/* ── Nifty 50 index history (Yahoo Finance) ────────────────────────────── */

// Full ^NSEI daily-close history, fetched once and cached for a day (index
// closes don't change again once the market shuts). Shaped like a NAV series
// ({ points, firstT, lastT }) so it can be run through the same windowReturn
// used for fund tenure returns.
//
// Fetch path: try our own same-origin serverless function (api/nifty-history.js)
// first — no CORS involved, works once deployed on Vercel. If that route
// doesn't exist (e.g. plain `vite dev` with no serverless runtime), fall back
// to a public CORS relay, which conveniently only permits free usage from
// localhost anyway.
async function fetchYahooNiftyChart() {
  try {
    const r = await fetch("/api/nifty-history");
    if (r.ok) {
      const data = await r.json(); // awaited inside try: a non-JSON response (e.g.
      if (data?.chart) return data; // Vite's dev server 404 page) falls through below
    }
  } catch {
    /* not deployed on Vercel (or the function errored) — fall through to the relay */
  }
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = Math.floor(Date.UTC(2000, 0, 1) / 1000);
  const url = `${YAHOO_CHART}?period1=${period1}&period2=${period2}&interval=1d`;
  return getJSON(`${CORS_RELAY}${encodeURIComponent(url)}`);
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
