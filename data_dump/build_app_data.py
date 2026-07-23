#!/usr/bin/env python3
"""
Generate the app's data files from the raw data_dump spreadsheets.

Inputs (this folder):
  - categories all funds.xlsx        -> SD_Category + ISIN per scheme
  - Detailed portfolio may'26.xlsx   -> 'Full universe' sheet: holdings,
                                        PD_Scheme AUM, sector, market-cap
  - Copy of FINAL_NAVandAUM_of_14_Funds.xlsx -> per-scheme month-end AUM history
                                        (₹ crore) + latest adjusted NAV, for an
                                        initial 14-fund pilot set (kept as-is,
                                        takes precedence over ALL_Funds_AUM.xlsx
                                        for these 14 schemes)
  - ALL_Funds_AUM.xlsx -> month-end AUM history (₹ crore) for ~1075 schemes,
                                        joined to our records by ISIN. Fills in
                                        every scheme NOT in the 14-fund file above.

Outputs (../public, fetched on demand by the dossier):
  - fundMeta.json      { _meta, funds: { <scheme>: {cat, aum, isin} } }
  - composition.json   { _meta, funds: { <scheme>: {n, asset, mcap, sectors, top} } }
  - aumHistory.json    { _meta, funds: { <scheme>: {isin, latestNav, navDate,
                                                     points: [[YYYYMM, aum], ...]} } }

AUM is the disclosed scheme AUM in Rs crore, point-in-time (as-of below).
There is NO return / NAV-history data in the source — performance must be
verified via outbound links, never fabricated.

Run:  python3 build_app_data.py
Requires:  openpyxl
"""
import json
import os
from collections import defaultdict

import openpyxl

AS_OF = "2026-05-31"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public")
CATEGORIES_XLSX = os.path.join(HERE, "categories all funds.xlsx")
PORTFOLIO_XLSX = os.path.join(HERE, "Detailed portfolio may'26.xlsx")
AUM_HISTORY_XLSX = os.path.join(HERE, "Copy of FINAL_NAVandAUM_of_14_Funds.xlsx")
ALL_FUNDS_AUM_XLSX = os.path.join(HERE, "ALL_Funds_AUM.xlsx")

META = {
    "source": "data_dump: 'Detailed portfolio may26.xlsx' (holdings/AUM) + "
    "'categories all funds.xlsx' (SD_Category)",
    "asOf": AS_OF,
    "note": "AUM = PD_Scheme AUM in Rs crore, point-in-time. Holdings %, sector "
    "and market-cap from disclosed portfolio. No return/NAV data in source.",
}


def num(x):
    return x if isinstance(x, (int, float)) else None


def build_aum_history():
    """Per-scheme month-end AUM time series (₹ crore) from the 14-fund workbook.

    Header is row 4:
      0 Scheme Code | 1 Scheme Name | 2 SD_Scheme ISIN | 3 ISIN Remark |
      4 AUMT_AUM Month End (YYYYMM int) | 5 AUMT_AUM (₹ cr) |
      6 NAV_NAV Date | 7 NAV_Adjusted NAV | 8 NAV_1 Month Return

    The NAV columns repeat the *latest* NAV on every row (there is no monthly
    NAV history here); only the AUM month-end series varies. Monthly NAV — needed
    to split market moves from flows — is fetched live from AMFI in the app.
    """
    if not os.path.exists(AUM_HISTORY_XLSX):
        print(f"aumHistory.json: skipped — {os.path.basename(AUM_HISTORY_XLSX)} not found")
        return None

    wb = openpyxl.load_workbook(AUM_HISTORY_XLSX, read_only=True, data_only=True)
    ws = wb.active
    funds = {}
    for r in ws.iter_rows(min_row=5, values_only=True):
        name = r[1]
        if not name:
            continue
        f = funds.get(name)
        if f is None:
            navdate = r[6]
            f = funds[name] = {
                "isin": r[2],
                "latestNav": num(r[7]),
                "navDate": navdate.date().isoformat() if hasattr(navdate, "date") else None,
                "_months": {},  # ym -> aum (dict dedupes repeated month rows)
            }
        ym, a = num(r[4]), num(r[5])
        if ym is not None and a is not None:
            f["_months"][int(ym)] = round(a, 2)
    wb.close()

    out = {}
    for name, f in funds.items():
        points = [[ym, f["_months"][ym]] for ym in sorted(f["_months"])]
        out[name] = {
            "isin": f["isin"],
            "latestNav": f["latestNav"],
            "navDate": f["navDate"],
            "points": points,
        }
    return out


def build_all_funds_aum_by_isin():
    """Per-ISIN month-end AUM time series (₹ crore) from ALL_Funds_AUM.xlsx.

    Header is row 4:
      0 Scheme Code | 1 Scheme Name | 2 SD_AMC Name | 3 SD_Fund Name |
      4 SD_Scheme ISIN | 5 AUMT_AUM Month End (YYYYMM int) | 6 AUMT_AUM (₹ cr) |
      7 AUMT_AUM Month End Date

    Keyed by ISIN (not scheme name) — ~90 scheme names in this workbook cover
    two ISINs each (an old ISIN retired mid-series, e.g. after a plan/scheme
    change), so joining by name would silently merge two different series.
    Joining by our own records' ISIN (the source of truth for scheme identity
    throughout this app) sidesteps that entirely. No NAV columns here; the app
    fetches NAV live from AMFI, so latestNav/navDate are left null.
    """
    if not os.path.exists(ALL_FUNDS_AUM_XLSX):
        print(f"ALL_Funds_AUM.xlsx not found — skipping")
        return {}

    wb = openpyxl.load_workbook(ALL_FUNDS_AUM_XLSX, read_only=True, data_only=True)
    ws = wb.active
    by_isin = {}  # isin -> {ym: aum}
    for r in ws.iter_rows(min_row=5, values_only=True):
        isin = r[4]
        ym, a = num(r[5]), num(r[6])
        if not isin or ym is None or a is None:
            continue
        by_isin.setdefault(isin, {})[int(ym)] = round(a, 2)
    wb.close()

    out = {}
    for isin, months in by_isin.items():
        points = [[ym, months[ym]] for ym in sorted(months)]
        out[isin] = {"isin": isin, "latestNav": None, "navDate": None, "points": points}
    return out


def main():
    # --- categories + ISIN ---
    cat, isin = {}, {}
    wb = openpyxl.load_workbook(CATEGORIES_XLSX, read_only=True, data_only=True)
    # header row is row 4: Scheme Code, Scheme Name, SD_Scheme ISIN, remark, SD_Category
    for r in wb.active.iter_rows(min_row=5, values_only=True):
        if r[1]:
            cat[r[1]] = r[4]
            isin[r[1]] = r[2]
    wb.close()

    # --- holdings + AUM ---
    wb = openpyxl.load_workbook(PORTFOLIO_XLSX, read_only=True, data_only=True)
    ws = wb["Full universe"]
    aum = {}
    comp = defaultdict(
        lambda: {
            "n": 0,
            "asset": defaultdict(float),
            "mcap": defaultdict(float),
            "sec": defaultdict(float),
            "hold": [],
        }
    )
    # header row 4: code,name,asset,assetType,instr,industry,isin,shares,holding%,
    #               mktval,schemeAUM,mcapType
    for r in ws.iter_rows(min_row=4, values_only=True):
        name = r[1]
        if not name:
            continue
        a = num(r[10])
        if a is not None:
            aum[name] = round(a, 2)
        hp = num(r[8]) or 0.0
        c = comp[name]
        c["n"] += 1
        c["asset"][r[3]] += hp
        if r[2] == "Equity":
            c["mcap"][r[11] or "?"] += hp
            c["sec"][r[5] or "?"] += hp
        c["hold"].append((r[4], round(hp, 2)))
    wb.close()

    fund_meta = dict(_meta=META)
    fund_meta["funds"] = {
        s: {"cat": cat[s], "aum": aum.get(s), "isin": isin.get(s)} for s in cat
    }

    composition = dict(_meta=META)
    composition["funds"] = {}
    for s, c in comp.items():
        composition["funds"][s] = {
            "n": c["n"],
            "asset": {
                k: round(v, 1)
                for k, v in sorted(c["asset"].items(), key=lambda x: -x[1])
                if v >= 0.05
            },
            "mcap": {
                k: round(v, 1)
                for k, v in sorted(c["mcap"].items(), key=lambda x: -x[1])
                if k != "?" and v >= 0.05
            },
            # Full lists (not top-N): the fund page shows every disclosed
            # sector and holding; cards slice the top few themselves.
            "sectors": [
                [k, round(v, 1)]
                for k, v in sorted(c["sec"].items(), key=lambda x: -x[1])
                if v > 0
            ],
            "top": [
                [k, v] for k, v in sorted(c["hold"], key=lambda x: -x[1]) if k
            ],
        }

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "fundMeta.json"), "w", encoding="utf-8") as f:
        json.dump(fund_meta, f, ensure_ascii=False)
    with open(os.path.join(OUT, "composition.json"), "w", encoding="utf-8") as f:
        json.dump(composition, f, ensure_ascii=False)

    print(f"fundMeta.json: {len(fund_meta['funds'])} schemes")
    print(f"composition.json: {len(composition['funds'])} funds")

    # --- month-end AUM history: 14-fund workbook (kept as-is) + ALL_Funds_AUM.xlsx
    #     (fills in every other scheme, joined by ISIN) ---
    aum_history = build_aum_history() or {}
    all_funds_by_isin = build_all_funds_aum_by_isin()
    added_from_all_funds = 0
    for name, meta in fund_meta["funds"].items():
        if name in aum_history:
            continue  # 14-fund workbook already covers this one — don't touch it
        isin = meta.get("isin")
        series = all_funds_by_isin.get(isin) if isin else None
        if series:
            aum_history[name] = series
            added_from_all_funds += 1

    if aum_history:
        aum_out = {
            "_meta": {
                "source": "data_dump: 'Copy of FINAL_NAVandAUM_of_14_Funds.xlsx' (14 "
                "pilot schemes, incl. latest NAV) + 'ALL_Funds_AUM.xlsx' (all other "
                "schemes, AUM only — joined by ISIN)",
                "asOf": AS_OF,
                "note": "Month-end AUM (₹ crore) per scheme, key YYYYMM. latestNav/"
                "navDate are only populated for the 14 pilot schemes. Monthly NAV "
                "(for flow estimation) is fetched live from AMFI for every scheme.",
            },
            "funds": aum_history,
        }
        with open(os.path.join(OUT, "aumHistory.json"), "w", encoding="utf-8") as f:
            json.dump(aum_out, f, ensure_ascii=False)
        pts = sum(len(v["points"]) for v in aum_history.values())
        print(
            f"aumHistory.json: {len(aum_history)} funds "
            f"(14 pilot + {added_from_all_funds} from ALL_Funds_AUM.xlsx), {pts} month-end points"
        )


if __name__ == "__main__":
    main()
