// Category (SD_Category, from categories all funds.xlsx) → broad asset class.
//
// Every category in today's dataset is an equity one — this app's data_dump
// is scoped to equity funds only, no debt/hybrid schemes exist in it yet.
// The map below is exhaustive for the categories we actually have; the
// keyword fallback exists so a future data update (debt/hybrid schemes
// added to data_dump) classifies correctly without this file needing edits,
// using AMFI's standard category-naming conventions.
const CATEGORY_ASSET_CLASS = {
  "Large Cap Fund": "Equity",
  "Mid Cap Fund": "Equity",
  "Small cap Fund": "Equity",
  "Large & Mid Cap": "Equity",
  "Multi Cap Fund": "Equity",
  "Flexi Cap Fund": "Equity",
  "Equity Linked Savings Scheme": "Equity",
  "Focused Fund": "Equity",
  "Value Fund": "Equity",
  Contra: "Equity",
  "Dividend Yield": "Equity",
  "Sector Funds": "Equity",
  "Thematic Fund": "Equity",
  // Every Index Fund / ETF in the current dataset tracks an equity index
  // (Nifty/Sensex/sector indices) — verified against the actual scheme names.
  "Index Funds": "Equity",
  ETFs: "Equity",
};

const HYBRID_KEYWORDS =
  /\b(hybrid|balanced advantage|dynamic asset allocation|multi\s?-?\s?asset|arbitrage|equity savings|balanced fund)\b/i;
const DEBT_KEYWORDS =
  /\b(gilt|liquid fund|overnight fund|money market|corporate bond|credit risk|banking\s*(and|&)\s*psu|duration|dynamic bond|floater|debt fund)\b/i;

// Classify a scheme's category string into "Equity" | "Debt" | "Hybrid" |
// "Other" (unrecognised / no category on record).
export function classifyCategory(cat) {
  if (!cat) return "Other";
  if (CATEGORY_ASSET_CLASS[cat]) return CATEGORY_ASSET_CLASS[cat];
  if (HYBRID_KEYWORDS.test(cat)) return "Hybrid";
  if (DEBT_KEYWORDS.test(cat)) return "Debt";
  return "Equity";
}

export const ASSET_CLASSES = ["Equity", "Debt", "Hybrid"];
