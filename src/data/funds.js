// Fund-manager history loader.
//
// The tenure records (~5,400 rows) live in public/fundHistory.json and are
// FETCHED at runtime rather than bundled into the app's JavaScript. That keeps
// them out of the main chunk (they were ~680 KB of an 830 KB bundle, blocking
// first paint) and — more importantly — makes the dataset swappable: dropping a
// regenerated fundHistory.json onto the host refreshes the whole site with no
// rebuild.
//
// Shape: { _meta: { asOf, records, ... }, records: [{ s, i, f, fd, td }] }
//   s  = scheme name        i  = fund inception (YYYY-MM-DD)
//   f  = fund manager       fd = tenure from   td = tenure to

let cache = null;
let pending = null;

// Derived once per load so nothing downstream has to re-scan the records.
function index(records, meta) {
  const managers = [...new Set(records.map((r) => r.f))].sort();
  const schemes = [...new Set(records.map((r) => r.s))].sort();

  // The dataset's own as-of date: the latest tenure end-date on record.
  // Everything that asks "is this manager still running this fund?" is judged
  // against THIS date, never against the wall clock — see utils.isActive.
  const asOf = records.reduce((m, r) => (r.td > m ? r.td : m), "") || null;

  const byManager = new Map();
  const byScheme = new Map();
  records.forEach((r) => {
    if (!byManager.has(r.f)) byManager.set(r.f, []);
    byManager.get(r.f).push(r);
    if (!byScheme.has(r.s)) byScheme.set(r.s, []);
    byScheme.get(r.s).push(r);
  });

  return {
    records,
    managers,
    schemes,
    byManager,
    byScheme,
    asOf: meta?.asOf || asOf,
    dataAsOf: asOf,
  };
}

export function loadFundHistory() {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  const base = import.meta.env.BASE_URL || "/";
  pending = fetch(base + "fundHistory.json")
    .then((r) => {
      if (!r.ok) throw new Error(`fundHistory.json → HTTP ${r.status}`);
      return r.json();
    })
    .then((d) => {
      const records = Array.isArray(d) ? d : d.records || [];
      if (!records.length) throw new Error("fundHistory.json contains no records");
      cache = index(records, d._meta);
      return cache;
    })
    .catch((err) => {
      pending = null; // allow a retry
      throw err;
    });
  return pending;
}
