// Lazy loader for the heavy, data-dump-derived files.
//
// fundMeta.json (~108 KB) and composition.json (~806 KB) live in /public and
// are fetched on demand (the first time a dossier is opened), then cached for
// the rest of the session. They are NOT bundled into the main JS.
//
// Provenance: both are generated from the data_dump spreadsheets
// ("Detailed portfolio may'26.xlsx" + "categories all funds.xlsx"),
// as-of 2026-05-31. AUM is the disclosed scheme AUM in ₹ crore (point-in-time).
// There is no return / NAV-history data in the source.

let cache = null;
let pending = null;

export function loadDossier() {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  const base = import.meta.env.BASE_URL || "/";
  pending = Promise.all([
    fetch(base + "fundMeta.json").then((r) => r.json()),
    fetch(base + "composition.json").then((r) => r.json()),
    // Month-end AUM history for the 14-fund workbook. Optional: if it is missing
    // the dossier still renders (funds simply show no tenure-AUM / flow chart).
    fetch(base + "aumHistory.json")
      .then((r) => (r.ok ? r.json() : { funds: {} }))
      .catch(() => ({ funds: {} })),
    // ISIN -> official Primary benchmark index name, from Benchmark_All_Funds.xlsx.
    // Optional: funds simply show no primary-benchmark figure if it's missing.
    fetch(base + "benchmarkPrimary.json")
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({})),
  ])
    .then(([meta, comp, aum, benchmarkPrimary]) => {
      cache = {
        meta: meta.funds || {},
        composition: comp.funds || {},
        aumHistory: aum.funds || {},
        benchmarkPrimary: benchmarkPrimary || {},
        asOf: meta._meta?.asOf || "2026-05-31",
        note: meta._meta?.note || "",
      };
      return cache;
    })
    .catch((err) => {
      pending = null; // allow retry on failure
      throw err;
    });
  return pending;
}

// "YYYY-MM-DD" → YYYYMM integer (the key used in aumHistory points).
export function isoToYearMonth(iso) {
  if (!iso) return null;
  const [y, m] = iso.split("-");
  return Number(y) * 100 + Number(m);
}

// "Aug 2012" label from a YYYYMM integer.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtYearMonth(ym) {
  if (ym == null) return "—";
  const m = ym % 100;
  return `${MONTHS[m - 1] || "?"} ${Math.floor(ym / 100)}`;
}

// AUM point on/before a target YYYYMM from an ascending points array
// [[ym, aum], ...]. If the target predates the series it is clamped to the
// first available month (flagged). Returns { ym, aum, clamped } or null.
export function aumAtMonth(points, targetYm) {
  if (!points || !points.length || targetYm == null) return null;
  if (targetYm < points[0][0]) {
    return { ym: points[0][0], aum: points[0][1], clamped: true };
  }
  let chosen = null;
  for (const [ym, aum] of points) {
    if (ym <= targetYm) chosen = { ym, aum, clamped: false };
    else break;
  }
  return chosen;
}

// ₹ crore → readable Indian-format string.
//   >= 1,00,000 cr  → "₹1.28 lakh cr"
//   otherwise       → "₹26,082 cr" (Indian digit grouping)
export function formatCrore(v) {
  if (v == null || isNaN(v)) return "—";
  if (v >= 100000) {
    return `₹${(v / 100000).toLocaleString("en-IN", {
      maximumFractionDigits: 2,
    })} lakh cr`;
  }
  return `₹${Math.round(v).toLocaleString("en-IN")} cr`;
}
