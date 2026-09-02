// AMC (Asset Management Company) registry.
//
// Maps the prefix that appears at the start of a scheme name to the fund
// house's canonical name and official website. We only assert an AMC when a
// scheme name confidently matches a known prefix — unmatched schemes return
// null rather than a guessed fund house, so we never present a fabricated
// affiliation.
//
// URLs are the AMCs' official homepages. They are stable but should be
// reviewed periodically; if a homepage is uncertain it is better to omit the
// `url` (the UI then falls back to a search link) than to assert a wrong one.

// Every entry is { name, url?, prefixes: [...] }.
//
// `prefixes` lists the scheme-name openings that ACTUALLY appear in the
// dataset — not the fund house's marketing name. The dataset abbreviates
// heavily ("Aditya Birla SL", "Canara Rob", "WOC", "ICICI Pru"), so matching on
// the canonical name alone left 233 of 1095 schemes (21%) with no fund house
// and, downstream, 120 of 735 managers showing "Other / unclassified" as their
// current AMC. Add the abbreviation, don't rename the data.
//
// `url` is omitted where the official homepage isn't confidently known — the UI
// then falls back to a search link, which is better than asserting a wrong one.
const AMC_LIST = [
  { name: "ICICI Prudential Mutual Fund", url: "https://www.icicipruamc.com",
    prefixes: ["ICICI Pru", "ICICI Prudential", "Bharat 22"] },
  { name: "HDFC Mutual Fund", url: "https://www.hdfcfund.com", prefixes: ["HDFC"] },
  { name: "SBI Mutual Fund", url: "https://www.sbimf.com", prefixes: ["SBI"] },
  { name: "Axis Mutual Fund", url: "https://www.axismf.com", prefixes: ["Axis"] },
  { name: "Kotak Mahindra Mutual Fund", url: "https://www.kotakmf.com", prefixes: ["Kotak"] },
  { name: "Nippon India Mutual Fund", url: "https://mf.nipponindiaim.com",
    prefixes: ["Nippon India", "CPSE ETF"] },
  { name: "Aditya Birla Sun Life Mutual Fund",
    url: "https://mutualfund.adityabirlacapital.com",
    prefixes: ["Aditya Birla Sun Life", "Aditya Birla SL", "ABSL"] },
  { name: "Mirae Asset Mutual Fund", url: "https://www.miraeassetmf.co.in", prefixes: ["Mirae Asset"] },
  { name: "DSP Mutual Fund", url: "https://www.dspim.com", prefixes: ["DSP"] },
  { name: "UTI Mutual Fund", url: "https://www.utimf.com", prefixes: ["UTI"] },
  { name: "Tata Mutual Fund", url: "https://www.tatamutualfund.com", prefixes: ["Tata"] },
  { name: "Franklin Templeton Mutual Fund", url: "https://www.franklintempletonindia.com",
    prefixes: ["Franklin", "Templeton India"] },
  { name: "Motilal Oswal Mutual Fund", url: "https://www.motilaloswalmf.com", prefixes: ["Motilal Oswal"] },
  { name: "PPFAS Mutual Fund", url: "https://amc.ppfas.com", prefixes: ["Parag Parikh", "PPFAS"] },
  { name: "Quant Mutual Fund", url: "https://quantmutual.com", prefixes: ["Quant"] },
  { name: "Edelweiss Mutual Fund", url: "https://www.edelweissmf.com", prefixes: ["Edelweiss"] },
  { name: "Canara Robeco Mutual Fund", url: "https://www.canararobeco.com",
    prefixes: ["Canara Robeco", "Canara Rob"] },
  { name: "Invesco Mutual Fund", url: "https://www.invescomutualfund.com", prefixes: ["Invesco"] },
  { name: "Bandhan Mutual Fund", url: "https://bandhanmutual.com", prefixes: ["Bandhan"] },
  { name: "Baroda BNP Paribas Mutual Fund", url: "https://www.barodabnpparibasmf.in",
    prefixes: ["Baroda BNP Paribas"] },
  { name: "HSBC Mutual Fund", url: "https://www.assetmanagement.hsbc.co.in", prefixes: ["HSBC"] },
  { name: "LIC Mutual Fund", url: "https://www.licmf.com", prefixes: ["LIC"] },
  { name: "Sundaram Mutual Fund", url: "https://www.sundarammutual.com", prefixes: ["Sundaram"] },
  { name: "360 ONE Mutual Fund", url: "https://www.360.one", prefixes: ["360 ONE"] },
  { name: "PGIM India Mutual Fund", url: "https://www.pgimindiamf.com", prefixes: ["PGIM India"] },
  { name: "Mahindra Manulife Mutual Fund", url: "https://www.mahindramanulife.com",
    prefixes: ["Mahindra Manulife"] },
  { name: "WhiteOak Capital Mutual Fund", url: "https://mf.whiteoakamc.com",
    prefixes: ["WhiteOak", "WOC"] },
  { name: "Quantum Mutual Fund", url: "https://www.quantumamc.com", prefixes: ["Quantum"] },
  { name: "JM Financial Mutual Fund", url: "https://www.jmfinancialmf.com",
    prefixes: ["JM Financial", "JM"] },
  { name: "Bank of India Mutual Fund", url: "https://www.boimf.in", prefixes: ["Bank of India"] },
  { name: "Bajaj Finserv Mutual Fund", url: "https://www.bajajamc.com", prefixes: ["Bajaj Finserv"] },

  // Fund houses present in the dataset that the registry previously missed.
  // Named only — homepages deliberately left out rather than guessed.
  { name: "Groww Mutual Fund", prefixes: ["Groww"] },
  { name: "Navi Mutual Fund", prefixes: ["Navi"] },
  { name: "Union Mutual Fund", prefixes: ["Union"] },
  { name: "ITI Mutual Fund", prefixes: ["ITI"] },
  { name: "Samco Mutual Fund", prefixes: ["Samco"] },
  { name: "Taurus Mutual Fund", prefixes: ["Taurus"] },
  { name: "Angel One Mutual Fund", prefixes: ["Angel One"] },
  { name: "Helios Mutual Fund", prefixes: ["Helios"] },
  { name: "TRUST Mutual Fund", prefixes: ["TRUSTMF", "TRUST MF"] },
  { name: "Zerodha Mutual Fund", prefixes: ["Zerodha"] },
  { name: "Shriram Mutual Fund", prefixes: ["Shriram"] },
  { name: "The Wealth Company Mutual Fund", prefixes: ["The Wealth Company"] },
  { name: "Abakkus Mutual Fund", prefixes: ["Abakkus"] },
  { name: "Choice Mutual Fund", prefixes: ["Choice"] },
  { name: "NJ Mutual Fund", prefixes: ["NJ"] },
  { name: "Old Bridge Mutual Fund", prefixes: ["Old Bridge"] },
  { name: "Capitalmind Mutual Fund", prefixes: ["Capitalmind"] },
  { name: "Unifi Mutual Fund", prefixes: ["Unifi"] },
];

// prefix -> entry, longest prefix first so "Baroda BNP Paribas" beats "Baroda"
// and "JM Financial" beats "JM".
const PREFIX_INDEX = AMC_LIST.flatMap((a) =>
  a.prefixes.map((p) => ({ prefix: p.toLowerCase(), amc: a }))
).sort((x, y) => y.prefix.length - x.prefix.length);

// Stable identifier for an AMC, used in URLs and for the Companies -> Funds
// drill-down. Deriving the filter from the display name (stripping " Mutual
// Fund" and matching it against scheme names) silently broke for every house
// whose schemes are abbreviated: clicking "ICICI Prudential Mutual Fund"
// (82 funds) or "Kotak Mahindra Mutual Fund" (66) landed on "No matches".
export function amcKey(name) {
  return name
    .toLowerCase()
    .replace(/\s*mutual fund$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const UNCLASSIFIED_AMC = "Other / unclassified";

// Every known fund house, for the Companies index.
export function allAMCs() {
  return AMC_LIST.map((a) => ({ name: a.name, url: a.url || null, key: amcKey(a.name) }));
}

// Returns { name, url, key } for a scheme, or null when no prefix matches.
// Unmatched schemes return null rather than a guessed fund house, so we never
// present a fabricated affiliation.
export function inferAMC(schemeName) {
  if (!schemeName) return null;
  const lower = schemeName.toLowerCase();
  const hit = PREFIX_INDEX.find((e) => lower.startsWith(e.prefix));
  if (!hit) return null;
  return { name: hit.amc.name, url: hit.amc.url || null, key: amcKey(hit.amc.name) };
}

// True when a scheme belongs to the AMC identified by `key`.
export function schemeBelongsToAMC(schemeName, key) {
  const amc = inferAMC(schemeName);
  return !!amc && amc.key === key;
}

// Unique AMCs across a list of scheme names (preserves first-seen order).
export function uniqueAMCs(schemeNames) {
  const seen = new Map();
  schemeNames.forEach((s) => {
    const amc = inferAMC(s);
    if (amc && !seen.has(amc.name)) seen.set(amc.name, amc);
  });
  return [...seen.values()];
}

// Builds deep links to authoritative places where a manager's profile can be
// independently verified. Aggregator links are site-scoped searches so they
// always resolve to the authoritative domain without guessing a slug/ID.
export function buildSourceLinks(name, amc) {
  const exact = encodeURIComponent(`"${name}"`);
  const links = [];

  if (amc?.url) {
    links.push({ label: amc.name, url: amc.url, primary: true });
  }

  links.push({
    label: "Value Research",
    url: `https://www.google.com/search?q=${encodeURIComponent(
      `site:valueresearchonline.com "${name}"`
    )}`,
  });
  links.push({
    label: "Morningstar",
    url: `https://www.google.com/search?q=${encodeURIComponent(
      `site:morningstar.in "${name}"`
    )}`,
  });
  links.push({ label: "AMFI", url: "https://www.amfiindia.com" });
  links.push({
    label: "Web search",
    url: `https://www.google.com/search?q=${exact}%20${encodeURIComponent(
      `${amc?.name || ""} fund manager`.trim()
    )}`,
  });

  return links;
}
