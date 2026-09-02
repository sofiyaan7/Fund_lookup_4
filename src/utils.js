export const formatDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const calcTenure = (fromDate, toDate) => {
  if (!fromDate || !toDate) return "—";
  const a = new Date(fromDate);
  const b = new Date(toDate);
  const totalMonths =
    (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
  // A same-month from/to (the dataset has ~210 of these) is a real but
  // sub-monthly stint — "0mo" reads like missing data, "<1mo" does not.
  if (totalMonths <= 0) return "<1mo";
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  if (y === 0) return `${m}mo`;
  if (m === 0) return `${y}y`;
  return `${y}y ${m}mo`;
};

/* ── "is this manager still running this fund?" ────────────────────────── */
//
// The records are month-end snapshots, so a tenure means "in post as at this
// month-end". A tenure is therefore OPEN when it runs to the most recent month
// recorded *for that same fund* — whoever holds the fund at its last
// observation is its current manager.
//
// Judged against the DATASET, never the wall clock. The previous test
// (`now - toDate < 120 days`) quietly turned the whole app inert 120 days after
// each data refresh: with most tenures stamped 2026-04-30, every manager became
// "not currently active" on 2026-08-28 and 1015 of 1095 funds reported "no
// current manager".
//
// Per-fund rather than one global date, because funds don't all report through
// the same month — this dump ends 2026-04-30 for 1011 funds, 2026-05-31 for 80
// and 2026-02-28 for 4. A single global cutoff would wrongly retire whichever
// group lags.

const SCHEME_LATEST = new Map(); // scheme -> latest td on record
let DATASET_AS_OF = null; // latest td anywhere in the dataset
let STALE_CUTOFF = null; // a fund silent since before this is treated as closed

// Funds that stopped reporting this long before the dump's as-of date are
// assumed discontinued, so their last manager is not billed as "current".
// Generous on purpose: this dump has no such funds, but a future one might.
const STALE_MONTHS = 18;

function minusMonths(iso, months) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 - months, d));
  return dt.toISOString().slice(0, 10);
}

// Called once, by the dataset loader, before anything renders.
export const setDataset = (records, asOf) => {
  SCHEME_LATEST.clear();
  (records || []).forEach((r) => {
    const cur = SCHEME_LATEST.get(r.s);
    if (!cur || r.td > cur) SCHEME_LATEST.set(r.s, r.td);
  });
  DATASET_AS_OF =
    asOf || (records || []).reduce((mx, r) => (r.td > mx ? r.td : mx), "") || null;
  STALE_CUTOFF = DATASET_AS_OF ? minusMonths(DATASET_AS_OF, STALE_MONTHS) : null;
};

// "May 2026" label for the dataset's as-of date.
export const datasetAsOfLabel = () => {
  if (!DATASET_AS_OF) return "—";
  return new Date(DATASET_AS_OF + "T00:00:00").toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
};

// `record` is a tenure row — needs { s, td }. Passing only a date can't work:
// whether a tenure is open depends on the fund it belongs to.
export const isActive = (record) => {
  if (!record || !record.td || !record.s) return false;
  const latest = SCHEME_LATEST.get(record.s);
  if (!latest) return false;
  if (STALE_CUTOFF && latest < STALE_CUTOFF) return false;
  return record.td >= latest;
};

// Whole years between two dates (rounded), used for an experience span.
export const yearsBetween = (from, to) => {
  if (!from || !to) return 0;
  const a = new Date(from);
  const b = new Date(to);
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24 * 365.25)));
};

// Total months of a tenure, used for sorting by longevity.
export const tenureMonths = (from, to) => {
  if (!from || !to) return 0;
  const a = new Date(from);
  const b = new Date(to);
  if (isNaN(a) || isNaN(b)) return 0;
  return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
};
