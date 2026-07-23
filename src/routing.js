// Deep-link support: lets another site link straight into a fund's page,
// e.g. https://<site>/fund/<Scheme%20Name>, and keeps this app's URL in
// sync with the current selection so links can be copied back out.
import FUND_DATA from "./data/funds";

const NAV_KEYS = ["managers", "funds", "companies"];

function findByNameLoose(list, needle) {
  if (list.includes(needle)) return needle;
  const lower = needle.trim().toLowerCase();
  return list.find((x) => x.trim().toLowerCase() === lower) || null;
}

export function schemeHref(name) {
  return `/fund/${encodeURIComponent(name)}`;
}

export function managerHref(name) {
  return `/manager/${encodeURIComponent(name)}`;
}

export function navHref(nav) {
  return nav === "dashboard" ? "/" : `/${nav}`;
}

// Reads window.location.pathname (+ optional ?fund=/?manager= query params
// as a fallback for hosts that can't build path segments) and resolves it
// to either a { selected, mode } pair or a { nav } pair. Returns null for
// an unrecognized path (caller should fall back to the empty dashboard).
export function parseLocation(pathname, search) {
  const schemes = [...new Set(FUND_DATA.map((r) => r.s))];
  const managers = [...new Set(FUND_DATA.map((r) => r.f))];

  const params = new URLSearchParams(search || "");
  const qFund = params.get("fund") || params.get("scheme");
  const qManager = params.get("manager") || params.get("fm");
  if (qFund) {
    const match = findByNameLoose(schemes, qFund);
    if (match) return { mode: "scheme", selected: match };
  }
  if (qManager) {
    const match = findByNameLoose(managers, qManager);
    if (match) return { mode: "manager", selected: match };
  }

  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return { nav: "dashboard" };

  const [kind, raw] = parts;
  if (parts.length === 1 && NAV_KEYS.includes(kind)) {
    return { nav: kind };
  }
  if (raw === undefined) return null;

  let name;
  try {
    name = decodeURIComponent(raw);
  } catch {
    return null;
  }

  if (kind === "fund" || kind === "scheme") {
    const match = findByNameLoose(schemes, name);
    return match ? { mode: "scheme", selected: match } : null;
  }
  if (kind === "manager" || kind === "fm") {
    const match = findByNameLoose(managers, name);
    return match ? { mode: "manager", selected: match } : null;
  }
  return null;
}
