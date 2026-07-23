// Curated fund-manager profiles.
//
// RULES — read before adding an entry:
//   1. Every field MUST carry a `src` that is a real http(s) URL pointing to
//      an authoritative source (the AMC's own site / factsheet / SID, AMFI,
//      or an established data house such as Value Research / Morningstar).
//   2. Do NOT add a field you cannot cite. `getManagerProfile` drops any field
//      whose `src` is missing or not a URL, so an unsourced claim cannot render
//      — but the real safeguard is not writing one in the first place.
//   3. When sources disagree (e.g. years of experience), cite the specific
//      source on the specific field rather than averaging or guessing.
//
// Field shape: { label, value, src }
//   label — short caption (e.g. "Education")
//   value — the verbatim/paraphrased fact
//   src   — URL the value was taken from
//
// Managers without an entry here fall back to derived facts + verify links.
//
// Two sources feed the registry:
//   - GENERATED (managerProfilesGenerated.js) — auto-extracted by the web
//     pipeline, each field cited to a fetched page.
//   - MANUAL (below) — hand-verified entries; these OVERRIDE generated ones.

import GENERATED from "./managerProfilesGenerated";

const MANUAL = {
  "Vaibhav Dusad": {
    fields: [
      {
        label: "Current role",
        value: "Senior investment analyst & fund manager, ICICI Prudential AMC",
        src: "https://www.icicidirect.com/mutual-funds/fund-manager/vaibhav-dusad/875",
      },
      {
        label: "Education",
        value:
          "MBA, Indian School of Business; B.Tech & M.Tech (dual degree), IIT Madras (Metallurgy & Materials Engineering)",
        src: "https://www.dezerv.in/mutual-funds/fund-manager/vaibhav-dusad/",
      },
      {
        // Sources frame experience differently — cite each on its own line
        // rather than blending into one figure.
        label: "Experience",
        value: "~11 years in investment analysis (ICICIdirect)",
        src: "https://www.icicidirect.com/mutual-funds/fund-manager/vaibhav-dusad/875",
      },
      {
        label: "Track record",
        value: "15+ years investing in Indian public equity markets (Dezerv)",
        src: "https://www.dezerv.in/mutual-funds/fund-manager/vaibhav-dusad/",
      },
      {
        label: "Sector focus",
        value:
          "IT services, telecom, internet, textiles, business services, pharma & healthcare",
        src: "https://www.dezerv.in/mutual-funds/fund-manager/vaibhav-dusad/",
      },
      {
        label: "AUM managed",
        value: "₹73,917 Cr across 6 schemes (as listed on ICICIdirect; point-in-time)",
        src: "https://www.icicidirect.com/mutual-funds/fund-manager/vaibhav-dusad/875",
      },
      {
        label: "Previously",
        value:
          "Morgan Stanley (Jun 2014–Dec 2017), HSBC (Nov 2011–Apr 2013), CRISIL Irevna (2010–11), Zinnov (2009–10)",
        src: "https://www.icicidirect.com/mutual-funds/fund-manager/vaibhav-dusad/875",
      },
    ],
  },
};

// Hand-verified MANUAL entries win over auto-extracted GENERATED ones.
const MANAGER_PROFILES = { ...GENERATED, ...MANUAL };

const isUrl = (s) => typeof s === "string" && /^https?:\/\//i.test(s);

// Returns { fields: [...] } with only properly-sourced fields, or null if the
// manager has no entry or no field survives validation.
export function getManagerProfile(name) {
  const entry = MANAGER_PROFILES[name];
  if (!entry || !Array.isArray(entry.fields)) return null;
  const fields = entry.fields.filter((f) => f && f.value && isUrl(f.src));
  return fields.length ? { fields } : null;
}
