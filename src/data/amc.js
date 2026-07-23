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

const AMC_REGISTRY = {
  "ICICI Pru": { name: "ICICI Prudential Mutual Fund", url: "https://www.icicipruamc.com" },
  HDFC: { name: "HDFC Mutual Fund", url: "https://www.hdfcfund.com" },
  SBI: { name: "SBI Mutual Fund", url: "https://www.sbimf.com" },
  Axis: { name: "Axis Mutual Fund", url: "https://www.axismf.com" },
  Kotak: { name: "Kotak Mahindra Mutual Fund", url: "https://www.kotakmf.com" },
  "Nippon India": { name: "Nippon India Mutual Fund", url: "https://mf.nipponindiaim.com" },
  "Aditya Birla Sun Life": {
    name: "Aditya Birla Sun Life Mutual Fund",
    url: "https://mutualfund.adityabirlacapital.com",
  },
  ABSL: {
    name: "Aditya Birla Sun Life Mutual Fund",
    url: "https://mutualfund.adityabirlacapital.com",
  },
  "Mirae Asset": { name: "Mirae Asset Mutual Fund", url: "https://www.miraeassetmf.co.in" },
  DSP: { name: "DSP Mutual Fund", url: "https://www.dspim.com" },
  UTI: { name: "UTI Mutual Fund", url: "https://www.utimf.com" },
  Tata: { name: "Tata Mutual Fund", url: "https://www.tatamutualfund.com" },
  Franklin: {
    name: "Franklin Templeton Mutual Fund",
    url: "https://www.franklintempletonindia.com",
  },
  "Motilal Oswal": { name: "Motilal Oswal Mutual Fund", url: "https://www.motilaloswalmf.com" },
  "Parag Parikh": { name: "PPFAS Mutual Fund", url: "https://amc.ppfas.com" },
  PPFAS: { name: "PPFAS Mutual Fund", url: "https://amc.ppfas.com" },
  Quant: { name: "Quant Mutual Fund", url: "https://quantmutual.com" },
  Edelweiss: { name: "Edelweiss Mutual Fund", url: "https://www.edelweissmf.com" },
  "Canara Robeco": { name: "Canara Robeco Mutual Fund", url: "https://www.canararobeco.com" },
  Invesco: { name: "Invesco Mutual Fund", url: "https://www.invescomutualfund.com" },
  Bandhan: { name: "Bandhan Mutual Fund", url: "https://bandhanmutual.com" },
  "Baroda BNP Paribas": {
    name: "Baroda BNP Paribas Mutual Fund",
    url: "https://www.barodabnpparibasmf.in",
  },
  HSBC: { name: "HSBC Mutual Fund", url: "https://www.assetmanagement.hsbc.co.in" },
  LIC: { name: "LIC Mutual Fund", url: "https://www.licmf.com" },
  Sundaram: { name: "Sundaram Mutual Fund", url: "https://www.sundarammutual.com" },
  "360 ONE": { name: "360 ONE Mutual Fund", url: "https://www.360.one" },
  "PGIM India": { name: "PGIM India Mutual Fund", url: "https://www.pgimindiamf.com" },
  "Mahindra Manulife": {
    name: "Mahindra Manulife Mutual Fund",
    url: "https://www.mahindramanulife.com",
  },
  WhiteOak: { name: "WhiteOak Capital Mutual Fund", url: "https://mf.whiteoakamc.com" },
  Quantum: { name: "Quantum Mutual Fund", url: "https://www.quantumamc.com" },
  "JM Financial": { name: "JM Financial Mutual Fund", url: "https://www.jmfinancialmf.com" },
  "Bank of India": { name: "Bank of India Mutual Fund", url: "https://www.boimf.in" },
  "Bajaj Finserv": { name: "Bajaj Finserv Mutual Fund", url: "https://www.bajajamc.com" },
};

// Longest prefixes first so "Baroda BNP Paribas" wins over a shorter "Baroda".
const SORTED_KEYS = Object.keys(AMC_REGISTRY).sort((a, b) => b.length - a.length);

// Returns { name, url } for a scheme, or null when no prefix matches.
export function inferAMC(schemeName) {
  if (!schemeName) return null;
  const key = SORTED_KEYS.find((k) =>
    schemeName.toLowerCase().startsWith(k.toLowerCase())
  );
  return key ? AMC_REGISTRY[key] : null;
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
