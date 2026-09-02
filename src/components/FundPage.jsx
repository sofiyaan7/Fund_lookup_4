import { useEffect, useMemo, useRef, useState } from "react";
import { formatDate, isActive } from "../utils";
import { inferAMC } from "../data/amc";
import { loadDossier, formatCrore, fmtYearMonth } from "../data/dossier";
import {
  resolveNav,
  snapshotReturns,
  navOn,
  fmtPct,
  fmtNavDate,
} from "../data/liveData";
import {
  effectiveAum,
  getOverride,
  setOverride,
  clearOverride,
  useAumOverrides,
} from "../data/aumStore";
import SectorChart from "./SectorChart";
import "./ManagerProfile.css";
import "./FundPage.css";

const DAY = 86400000;

const MCAP_COLORS = {
  "Large Cap": "rgba(63, 185, 80, 0.65)",
  "Mid Cap": "rgba(210, 153, 34, 0.6)",
  "Small Cap": "rgba(240, 136, 62, 0.6)",
};

const RANGES = [
  { key: "1y", label: "1Y", days: 365 },
  { key: "3y", label: "3Y", days: 3 * 365 },
  { key: "5y", label: "5Y", days: 5 * 365 },
  { key: "max", label: "Max", days: null },
];

// Downsampled SVG line chart of the NAV history with a range toggle and a
// hover crosshair (mouse or touch) showing the exact date, NAV and the
// change from the start of the visible range at the pointer's position.
function NavChart({ nav }) {
  const [range, setRange] = useState("max");
  const [hover, setHover] = useState(null); // index into view.sampled

  const view = useMemo(() => {
    const sel = RANGES.find((r) => r.key === range) || RANGES[3];
    const last = nav.points[nav.points.length - 1];
    const cutoff = sel.days ? last.t - sel.days * DAY : -Infinity;
    let pts = nav.points.filter((p) => p.t >= cutoff);
    if (pts.length < 2) pts = nav.points.slice(-2);

    const step = Math.max(1, Math.floor(pts.length / 320));
    const sampled = pts.filter((_, i) => i % step === 0);
    if (sampled[sampled.length - 1] !== pts[pts.length - 1]) sampled.push(pts[pts.length - 1]);

    const lo = Math.min(...sampled.map((p) => p.nav));
    const hi = Math.max(...sampled.map((p) => p.nav));
    const pad = (hi - lo) * 0.06 || hi * 0.02;
    const y0 = lo - pad;
    const y1 = hi + pad;
    const t0 = sampled[0].t;
    const t1 = sampled[sampled.length - 1].t;

    const W = 600;
    const H = 170;
    const xOf = (t) => ((t - t0) / Math.max(1, t1 - t0)) * W;
    const yOf = (v) => H - ((v - y0) / (y1 - y0)) * H;

    const withXY = sampled.map((p) => {
      const x = xOf(p.t);
      const y = yOf(p.nav);
      return { ...p, x, y, xPct: (x / W) * 100, yPct: (y / H) * 100 };
    });

    const line = withXY.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const area = `0,${H} ${line} ${W},${H}`;
    const startNav = withXY[0].nav;
    const change = withXY[withXY.length - 1].nav / startNav - 1;

    return {
      sampled: withXY,
      line,
      area,
      change,
      startNav,
      lo,
      hi,
      from: withXY[0],
      to: withXY[withXY.length - 1],
      t0,
      t1,
      W,
      H,
    };
  }, [nav, range]);

  const up = view.change >= 0;
  const stroke = up ? "var(--accent)" : "var(--danger)";

  // Map a pointer x to the nearest sampled point.
  const onMove = (clientX, rectLeft, rectWidth) => {
    const frac = Math.min(1, Math.max(0, (clientX - rectLeft) / rectWidth));
    const tHover = view.t0 + frac * (view.t1 - view.t0);
    let idx = 0;
    let best = Infinity;
    view.sampled.forEach((p, i) => {
      const d = Math.abs(p.t - tHover);
      if (d < best) {
        best = d;
        idx = i;
      }
    });
    setHover(idx);
  };
  const handleMouseMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    onMove(e.clientX, r.left, r.width);
  };
  const handleTouchMove = (e) => {
    if (!e.touches[0]) return;
    const r = e.currentTarget.getBoundingClientRect();
    onMove(e.touches[0].clientX, r.left, r.width);
  };

  const hp = hover != null ? view.sampled[hover] : null;
  const hpChange = hp ? hp.nav / view.startNav - 1 : null;
  const tipFlip = hp && hp.xPct > 55;

  return (
    <div className="fpg-chart">
      <div className="fpg-chart-head">
        <span className={`d-ret ${up ? "d-ret--pos" : "d-ret--neg"}`}>
          <span className="d-ret-arrow">{up ? "↗" : "↘"}</span>
          {fmtPct(view.change)}
          <span className="d-ret-pa">{range === "max" ? "since " + fmtNavDate(view.from.t).slice(-4) : range.toUpperCase()}</span>
        </span>
        <div className="seg seg-sm" role="group" aria-label="Chart range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`seg-btn ${range === r.key ? "seg-on" : ""}`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div
        className="fpg-aum-wrap"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={handleTouchMove}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${view.W} ${view.H}`}
          className="fpg-svg"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polygon points={view.area} fill={stroke} opacity="0.08" />
          <polyline points={view.line} fill="none" stroke={stroke} strokeWidth="2" />
        </svg>

        {hp && (
          <>
            <div className="fpg-cross" style={{ left: `${hp.xPct}%` }} />
            <div
              className="fpg-dot fpg-dot--aum"
              style={{ left: `${hp.xPct}%`, top: `${hp.yPct}%`, background: stroke }}
            />
            <div
              className={`fpg-tip ${tipFlip ? "fpg-tip--left" : ""}`}
              style={{ left: `${hp.xPct}%` }}
            >
              <div className="fpg-tip-title">{fmtNavDate(hp.t)}</div>
              <div className="fpg-tip-row">
                <span className="fpg-tip-k">NAV</span>
                <span className="fpg-tip-v">₹{hp.nav.toFixed(2)}</span>
              </div>
              <div className="fpg-tip-row">
                <span className="fpg-tip-k">Change from {fmtNavDate(view.from.t)}</span>
                <span className={`fpg-tip-v ${hpChange >= 0 ? "is-pos" : "is-neg"}`}>
                  {fmtPct(hpChange)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
      <div className="fpg-chart-axis">
        <span>
          {fmtNavDate(view.from.t)} · ₹{view.from.nav.toFixed(1)}
        </span>
        <span className="fpg-axis-mid">
          NAV range ₹{view.lo.toFixed(1)} – ₹{view.hi.toFixed(1)}
        </span>
        <span>
          {fmtNavDate(view.to.t)} · ₹{view.to.nav.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

// Month-end timestamp (ms, UTC) for a YYYYMM key: day 0 of the next month is
// the last calendar day of this one.
function monthEndTs(ym) {
  return Date.UTC(Math.floor(ym / 100), ym % 100, 0);
}

// ₹ crore with one decimal, e.g. "₹25,232.1 cr" (tooltip precision).
function fmtCrExact(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })} cr`;
}

// AUM chart, sharing NavChart's range toggle. Two lines:
//   • Actual AUM (solid, disclosed month-end size), and
//   • "Without inflows/outflows" — the counterfactual AUM if only the market
//     moved it: the first visible month's AUM chained forward by each month's
//     adjusted-NAV return. The gap between the lines is cumulative net flow.
// Per-month net flow = actual − expected, where expected = prior month's AUM
// grown by that month's NAV return (the user's method). NAV is the same
// ISIN-verified AMFI history as the NAV chart; months with no NAV coverage are
// carried flat and show no flow bar — flows are never fabricated. Hovering the
// chart shows that month's actual, counterfactual and net-flow figures.
function AumFlowChart({ series, nav, navFail }) {
  const [range, setRange] = useState("3y");
  const [hover, setHover] = useState(null); // visible-index under the cursor

  const monthly = useMemo(
    () => series.points.map(([ym, aum]) => ({ ym, t: monthEndTs(ym), aum })),
    [series]
  );

  const view = useMemo(() => {
    const sel = RANGES.find((r) => r.key === range) || RANGES[3];
    const last = monthly[monthly.length - 1];
    const cutoff = sel.days ? last.t - sel.days * DAY : -Infinity;
    let idx = monthly.map((_, i) => i).filter((i) => monthly[i].t >= cutoff);
    if (idx.length < 2) idx = monthly.map((_, i) => i).slice(-2);

    // Month-end NAV for each visible month (null before AMFI's online history).
    const navAt = idx.map((i) => (nav ? navOn(nav, monthly[i].t)?.nav ?? null : null));

    // Build visible rows with per-month net flow and the chained counterfactual.
    const vis = idx.map((i, k) => {
      const p = monthly[i];
      let flow = null;
      if (k > 0 && navAt[k] != null && navAt[k - 1] != null && navAt[k - 1] > 0) {
        flow = p.aum - monthly[idx[k - 1]].aum * (navAt[k] / navAt[k - 1]);
      }
      return { ym: p.ym, t: p.t, aum: p.aum, flow };
    });
    // Counterfactual: start at the first visible AUM, grow only by NAV returns.
    let wf = nav ? vis[0].aum : null;
    vis.forEach((p, k) => {
      if (!nav) {
        p.wf = null;
        return;
      }
      if (k > 0 && navAt[k] != null && navAt[k - 1] != null && navAt[k - 1] > 0) {
        wf = wf * (navAt[k] / navAt[k - 1]);
      }
      p.wf = wf;
    });

    const vals = vis.flatMap((p) => (p.wf != null ? [p.aum, p.wf] : [p.aum]));
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo) * 0.08 || hi * 0.05 || 1;
    const y0 = lo - pad;
    const y1 = hi + pad;
    const t0 = vis[0].t;
    const t1 = vis[vis.length - 1].t;
    const W = 600;
    const H = 150;
    const FH = 60; // flow strip height
    const xOf = (t) => ((t - t0) / Math.max(1, t1 - t0)) * W;
    const yOf = (v) => H - ((v - y0) / (y1 - y0)) * H;

    // Geometry per point (both viewBox coords and % for the HTML hover layer).
    vis.forEach((p) => {
      p.x = xOf(p.t);
      p.xPct = (p.x / W) * 100;
      p.yAum = yOf(p.aum);
      p.yAumPct = (p.yAum / H) * 100;
      if (p.wf != null) {
        p.yWf = yOf(p.wf);
        p.yWfPct = (p.yWf / H) * 100;
      }
    });

    const aumLine = vis.map((p) => `${p.x.toFixed(1)},${p.yAum.toFixed(1)}`).join(" ");
    const area = `0,${H} ${aumLine} ${W},${H}`;
    const wfLine = nav
      ? vis.map((p) => `${p.x.toFixed(1)},${p.yWf.toFixed(1)}`).join(" ")
      : "";

    const flowVals = vis.map((p) => p.flow).filter((f) => f != null);
    const maxAbs = flowVals.length ? Math.max(...flowVals.map(Math.abs)) : 0;
    const netFlow = flowVals.reduce((a, b) => a + b, 0);
    const bw = Math.max(1, (W / Math.max(1, vis.length)) * 0.62);
    const bars = vis
      .filter((p) => p.flow != null)
      .map((p) => {
        const h = maxAbs ? (Math.abs(p.flow) / maxAbs) * (FH / 2 - 2) : 0;
        const up = p.flow >= 0;
        return {
          x: p.x - bw / 2,
          cx: p.x,
          y: up ? FH / 2 - h : FH / 2,
          w: bw,
          h: Math.max(0.6, h),
          up,
          ym: p.ym,
        };
      });

    return {
      vis, aumLine, wfLine, area, W, H, FH, lo, hi, t0, t1,
      from: vis[0], to: vis[vis.length - 1],
      bars, netFlow, hasFlows: flowVals.length > 0, hasWf: !!nav,
    };
  }, [monthly, range, nav]);

  const grew = view.to.aum >= view.from.aum;

  // Map a pointer x to the nearest visible month.
  const onMove = (clientX, rectLeft, rectWidth) => {
    const frac = Math.min(1, Math.max(0, (clientX - rectLeft) / rectWidth));
    const tHover = view.t0 + frac * (view.t1 - view.t0);
    let idx = 0;
    let best = Infinity;
    view.vis.forEach((p, i) => {
      const d = Math.abs(p.t - tHover);
      if (d < best) {
        best = d;
        idx = i;
      }
    });
    setHover(idx);
  };
  const handleMouseMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    onMove(e.clientX, r.left, r.width);
  };
  const handleTouchMove = (e) => {
    if (!e.touches[0]) return;
    const r = e.currentTarget.getBoundingClientRect();
    onMove(e.touches[0].clientX, r.left, r.width);
  };

  const hp = hover != null ? view.vis[hover] : null;
  const tipFlip = hp && hp.xPct > 55;

  return (
    <div className="fpg-chart">
      <div className="fpg-chart-head">
        <span className={`d-ret ${grew ? "d-ret--pos" : "d-ret--neg"}`}>
          <span className="d-ret-arrow">{grew ? "↗" : "↘"}</span>
          {formatCrore(view.to.aum)}
          <span className="d-ret-pa">latest AUM</span>
        </span>
        <div className="seg seg-sm" role="group" aria-label="Chart range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`seg-btn ${range === r.key ? "seg-on" : ""}`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="fpg-legend">
        <span className="fpg-leg">
          <span className="fpg-leg-line fpg-leg-line--aum" />
          Actual AUM
        </span>
        <span className="fpg-leg">
          <span className="fpg-leg-line fpg-leg-line--wf" />
          Without inflows / outflows
        </span>
      </div>

      <div
        className="fpg-aum-wrap"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={handleTouchMove}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${view.W} ${view.H}`}
          className="fpg-svg"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polygon points={view.area} fill="var(--info)" opacity="0.10" />
          {view.hasWf && (
            <polyline
              points={view.wfLine}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.75"
              strokeDasharray="6 4"
              opacity="0.9"
            />
          )}
          <polyline points={view.aumLine} fill="none" stroke="var(--info)" strokeWidth="2" />
        </svg>

        {hp && (
          <>
            <div className="fpg-cross" style={{ left: `${hp.xPct}%` }} />
            <div
              className="fpg-dot fpg-dot--aum"
              style={{ left: `${hp.xPct}%`, top: `${hp.yAumPct}%` }}
            />
            {hp.wf != null && (
              <div
                className="fpg-dot fpg-dot--wf"
                style={{ left: `${hp.xPct}%`, top: `${hp.yWfPct}%` }}
              />
            )}
            <div
              className={`fpg-tip ${tipFlip ? "fpg-tip--left" : ""}`}
              style={{ left: `${hp.xPct}%` }}
            >
              <div className="fpg-tip-title">{fmtYearMonth(hp.ym)}</div>
              <div className="fpg-tip-row">
                <span className="fpg-tip-k fpg-tip-k--aum">Actual AUM</span>
                <span className="fpg-tip-v">{fmtCrExact(hp.aum)}</span>
              </div>
              {hp.wf != null && (
                <div className="fpg-tip-row">
                  <span className="fpg-tip-k fpg-tip-k--wf">Without inflows</span>
                  <span className="fpg-tip-v">{fmtCrExact(hp.wf)}</span>
                </div>
              )}
              <div className="fpg-tip-row">
                <span className="fpg-tip-k">Net flow this month</span>
                <span className={`fpg-tip-v ${hp.flow == null ? "" : hp.flow >= 0 ? "is-pos" : "is-neg"}`}>
                  {hp.flow == null
                    ? "—"
                    : `${hp.flow >= 0 ? "+" : "−"}${fmtCrExact(Math.abs(hp.flow))}`}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="fpg-flow-head">
        <span className="fpg-flow-title">Estimated net flow (inflow / outflow)</span>
        <span className={`fpg-flow-net ${view.netFlow >= 0 ? "is-pos" : "is-neg"}`}>
          {view.hasFlows
            ? `${view.netFlow >= 0 ? "+" : "−"}${formatCrore(Math.abs(view.netFlow))} over range`
            : nav
            ? "no NAV overlap in range"
            : navFail
            ? "no ISIN-verified NAV for this scheme"
            : "loading NAV…"}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${view.W} ${view.FH}`}
        className="fpg-flow-svg"
        preserveAspectRatio="none"
      >
        <line
          x1="0"
          y1={view.FH / 2}
          x2={view.W}
          y2={view.FH / 2}
          stroke="var(--border-strong)"
          strokeWidth="1"
        />
        {view.bars.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            fill={b.up ? "var(--accent)" : "var(--danger)"}
            opacity={hp && hp.ym === b.ym ? 1 : 0.62}
          />
        ))}
        {hp && (
          <line
            x1={hp.x}
            y1="0"
            x2={hp.x}
            y2={view.FH}
            stroke="var(--text-faint)"
            strokeWidth="1"
            opacity="0.6"
          />
        )}
      </svg>

      <div className="fpg-chart-axis">
        <span>
          {fmtYearMonth(view.from.ym)} · {formatCrore(view.from.aum)}
        </span>
        <span className="fpg-axis-mid">
          AUM {formatCrore(view.lo)} – {formatCrore(view.hi)}
        </span>
        <span>
          {fmtYearMonth(view.to.ym)} · {formatCrore(view.to.aum)}
        </span>
      </div>
    </div>
  );
}

// Editable current-AUM chip: shows the sourced figure (or a user override),
// lets the user correct or add it, and flags overrides as user-entered so they
// never masquerade as sourced data.
function AumChip({ scheme, baseAum }) {
  useAumOverrides(); // re-render when overrides change (this or another tab)
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const inputRef = useRef(null);

  const edited = !!getOverride(scheme);
  const eff = effectiveAum(scheme, baseAum);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const begin = () => {
    setVal(eff != null ? String(Math.round(eff)) : "");
    setEditing(true);
  };
  const save = () => {
    const n = Number(val);
    if (Number.isFinite(n) && n >= 0) setOverride(scheme, n);
    setEditing(false);
  };

  if (editing) {
    return (
      <span className="mp-chip mp-chip--edit">
        <span className="aum-edit-unit">₹</span>
        <input
          ref={inputRef}
          className="aum-edit-input"
          type="number"
          min="0"
          inputMode="decimal"
          value={val}
          placeholder="AUM"
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          aria-label={`AUM for ${scheme} in ₹ crore`}
        />
        <span className="aum-edit-unit">cr</span>
        <button type="button" className="aum-edit-btn is-save" onClick={save} title="Save">
          ✓
        </button>
        <button type="button" className="aum-edit-btn" onClick={() => setEditing(false)} title="Cancel">
          ✕
        </button>
        {edited && (
          <button
            type="button"
            className="aum-edit-btn"
            onClick={() => {
              clearOverride(scheme);
              setEditing(false);
            }}
            title="Reset to sourced value"
          >
            ↺
          </button>
        )}
      </span>
    );
  }

  return (
    <span className={`mp-chip mp-chip--aum ${edited ? "is-edited" : ""}`}>
      {eff != null ? formatCrore(eff) : "No AUM on record"}
      {edited && (
        <span
          className="aum-edited-tag"
          title={`User-edited · sourced value ${baseAum != null ? formatCrore(baseAum) : "n/a"}`}
        >
          edited
        </span>
      )}
      <button
        type="button"
        className="aum-edit-pencil"
        onClick={begin}
        title={eff != null ? "Edit AUM" : "Add AUM"}
      >
        {eff != null ? "✎" : "+ add"}
      </button>
    </span>
  );
}

function SnapStat({ label, value, sub, tone }) {
  return (
    <div className="card fpg-stat">
      <span className={`fpg-stat-val ${tone || ""}`}>{value}</span>
      <span className="fpg-stat-key">{label}</span>
      {sub && <span className="fpg-stat-sub">{sub}</span>}
    </div>
  );
}

function retTone(r) {
  if (!r) return "";
  const v = r.cagr != null ? r.cagr : r.abs;
  return v >= 0 ? "is-pos" : "is-neg";
}
function retVal(r) {
  if (!r) return "—";
  return r.cagr != null ? `${fmtPct(r.cagr)}` : fmtPct(r.abs);
}

// Full fund page: hero, live NAV snapshot + chart, composition (asset/mcap/
// sectors), all disclosed holdings. The manager-history panel is rendered
// below it by App.
export default function FundPage({ name, records, onOpenManager, onOpenCompany }) {
  const [meta, setMeta] = useState(null);
  const [comp, setComp] = useState(null);
  const [aumSeries, setAumSeries] = useState(null);
  const [nav, setNav] = useState(null);
  const [navFail, setNavFail] = useState(false);

  useEffect(() => {
    let alive = true;
    setMeta(null);
    setComp(null);
    setAumSeries(null);
    setNav(null);
    setNavFail(false);
    loadDossier()
      .then((d) => {
        if (!alive) return;
        const m = d.meta[name] || {};
        setMeta(m);
        setComp(d.composition[name] || null);
        setAumSeries(d.aumHistory?.[name] || null);
        resolveNav(name, m.isin)
          .then((n) => alive && setNav(n))
          .catch(() => alive && setNavFail(true));
      })
      .catch(() => alive && setNavFail(true));
    return () => {
      alive = false;
    };
  }, [name]);

  const derived = useMemo(() => {
    if (!records || !records.length) return null;
    const current = [...new Set(records.filter((r) => isActive(r)).map((r) => r.f))];
    const managers = [...new Set(records.map((r) => r.f))];
    const inception = records[0]?.i;
    // 64 records in the source dump start a tenure BEFORE the fund's recorded
    // inception (and 37 end before it) — impossible, and previously rendered
    // without comment. Surface the discrepancy rather than picking a winner:
    // we don't know which of the two dates is the wrong one.
    const earliestTenure = records.reduce(
      (min, r) => (!min || r.fd < min ? r.fd : min),
      null
    );
    const inceptionDisputed = !!(inception && earliestTenure && earliestTenure < inception);
    return {
      inception,
      earliestTenure,
      inceptionDisputed,
      managers: managers.length,
      current,
      amc: inferAMC(name),
    };
  }, [records, name]);

  const snap = useMemo(() => (nav ? snapshotReturns(nav) : null), [nav]);
  // Three distinct states, never conflated: resolved (snap), still resolving
  // (pending), or resolved-to-nothing (navFail).
  const pending = !snap && !navFail;

  if (!derived) return null;

  return (
    <>
      {/* Hero */}
      <div className="card mp-hero">
        <div className="mp-avatar mp-avatar--fund" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 3a7 7 0 1 0 7 7h-7V3z" />
            <path d="M13 3.6A7 7 0 0 1 16.4 7H13V3.6z" />
          </svg>
        </div>
        <div className="mp-hero-body">
          <div className="mp-name-row">
            <h2 className="mp-name">{name}</h2>
          </div>
          <p className="mp-role">
            {derived.amc ? derived.amc.name : "Mutual fund scheme"}
            {meta?.cat ? ` · ${meta.cat}` : ""}
          </p>
          <div className="mp-chips">
            {derived.amc && onOpenCompany && (
              <button
                type="button"
                className="mp-chip mp-chip--btn"
                onClick={() => onOpenCompany(derived.amc.name)}
                title={`Browse all ${derived.amc.name} funds`}
              >
                {derived.amc.name.replace(" Mutual Fund", "")} funds {"↗"}
              </button>
            )}
            {meta && <AumChip scheme={name} baseAum={meta.aum ?? null} />}
            <span
              className={`mp-chip ${derived.inceptionDisputed ? "mp-chip--warn" : ""}`}
              title={
                derived.inceptionDisputed
                  ? `Source data conflict: the earliest manager tenure on record starts ${formatDate(
                      derived.earliestTenure
                    )}, before this recorded inception date. One of the two is wrong in the source dump.`
                  : undefined
              }
            >
              Inception {formatDate(derived.inception)}
              {derived.inceptionDisputed && (
                <span className="mp-chip-flag" aria-label="source data conflict">
                  ?
                </span>
              )}
            </span>
            {comp && <span className="mp-chip">{comp.n} holdings</span>}
            <span className="mp-chip">
              {derived.managers} manager{derived.managers !== 1 ? "s" : ""} on record
            </span>
            {derived.current.map((m) => (
              <button
                key={m}
                type="button"
                className="mp-chip mp-chip--on mp-chip--btn"
                onClick={() => onOpenManager?.(m)}
                title={`Open ${m}`}
              >
                {m} {"↗"}
              </button>
            ))}
            {derived.current.length === 0 && (
              <span className="mp-chip">No current manager in records</span>
            )}
          </div>
        </div>
      </div>

      {/* Live NAV snapshot */}
      <div className="fpg-stats">
        <SnapStat
          label="Latest NAV"
          value={snap ? `₹${snap.latest.nav.toFixed(2)}` : pending ? "…" : "—"}
          sub={snap ? fmtNavDate(snap.latest.t) : pending ? "loading" : "no AMFI match"}
        />
        {/* `pending` is the only state that may show a spinner. When the
            scheme has no ISIN-verified AMFI match these tiles used to stay on
            "…" forever, so ~22% of fund pages advertised a load that was
            never going to finish. */}
        <SnapStat
          label="1Y return"
          value={snap ? retVal(snap.r1) : pending ? "…" : "—"}
          tone={snap ? retTone(snap.r1) : ""}
          sub={snap?.r1 ? "absolute → CAGR ≥1y" : navFail ? "no AMFI match" : ""}
        />
        <SnapStat
          label="3Y CAGR"
          value={snap ? retVal(snap.r3) : pending ? "…" : "—"}
          tone={snap ? retTone(snap.r3) : ""}
          sub={snap?.r3 ? "p.a." : navFail ? "no AMFI match" : ""}
        />
        <SnapStat
          label="5Y CAGR"
          value={snap ? retVal(snap.r5) : pending ? "…" : "—"}
          tone={snap ? retTone(snap.r5) : ""}
          sub={snap?.r5 ? "p.a." : navFail ? "no AMFI match" : ""}
        />
        <SnapStat
          label="Since"
          value={snap ? retVal(snap.si) : pending ? "…" : "—"}
          tone={snap ? retTone(snap.si) : ""}
          sub={
            snap?.si
              ? `${fmtNavDate(snap.si.sinceT)} · p.a.`
              : navFail
              ? "no AMFI match"
              : ""
          }
        />
      </div>

      {/* NAV chart */}
      <section className="card d-section">
        <div className="d-head">
          <span className="d-title">NAV history</span>
          <span className="d-note">
            {nav ? `AMFI via api.mfapi.in · ISIN-verified · ${nav.points.length.toLocaleString()} points` : navFail ? "no ISIN-verified AMFI match for this scheme" : "loading NAV history…"}
          </span>
        </div>
        {nav ? (
          <NavChart nav={nav} />
        ) : (
          <div className="d-empty">{navFail ? "NAV history unavailable." : "Loading…"}</div>
        )}
      </section>

      {/* AUM & flows — month-end AUM with estimated net inflow/outflow bars.
          Only rendered for funds that carry an AUM history in the data dump. */}
      {aumSeries?.points?.length > 1 && (
        <section className="card d-section">
          <div className="d-head">
            <span className="d-title">AUM &amp; flows</span>
            <span className="d-note">
              Month-end AUM · {aumSeries.points.length} months · est. net flow from AUM &amp; NAV
            </span>
          </div>
          <AumFlowChart series={aumSeries} nav={nav} navFail={navFail} />
          <p className="d-foot">
            AUM is the fund’s disclosed month-end size (₹ crore) from the data dump.
            <strong> Estimated net flow</strong> = actual AUM − expected AUM, where expected
            AUM is the prior month’s AUM grown by that month’s adjusted-NAV return (AMFI,
            ISIN-verified). It approximates investor inflows/outflows net of market moves;
            months before AMFI’s online NAV history show no flow bar.
          </p>
        </section>
      )}

      {/* Composition */}
      {comp && (
        <section className="card d-section">
          <div className="d-head">
            <span className="d-title">Composition</span>
            <span className="d-note">Disclosed portfolio · May 2026</span>
          </div>

          <div className="fpg-comp-grid">
            {comp.asset && Object.keys(comp.asset).length > 0 && (
              <div className="fpg-comp-block">
                <span className="fp-label">Asset allocation</span>
                {Object.entries(comp.asset).map(([k, v]) => (
                  <div key={k} className="fpg-alloc-row">
                    <span className="fpg-alloc-name">{k}</span>
                    <div className="fpg-alloc-track">
                      <div className="fpg-alloc-fill" style={{ width: `${Math.min(100, v)}%` }} />
                    </div>
                    <span className="fpg-alloc-val">{v}%</span>
                  </div>
                ))}
              </div>
            )}

            {comp.mcap && Object.keys(comp.mcap).length > 0 && (
              <div className="fpg-comp-block">
                <span className="fp-label">Market cap</span>
                <div className="d-stack">
                  {Object.entries(comp.mcap).map(([k, v]) => (
                    <div
                      key={k}
                      className="d-stack-seg"
                      style={{ width: `${v}%`, background: MCAP_COLORS[k] || "var(--border-strong)" }}
                      title={`${k} ${v}%`}
                    />
                  ))}
                  <div
                    className="d-stack-seg d-stack-rest"
                    style={{
                      width: `${Math.max(0, 100 - Object.values(comp.mcap).reduce((a, b) => a + b, 0))}%`,
                    }}
                    title="Other / cash / debt"
                  />
                </div>
                <div className="d-stack-legend">
                  {Object.entries(comp.mcap).map(([k, v]) => (
                    <span key={k} className="d-leg">
                      <span
                        className="d-swatch"
                        style={{ background: MCAP_COLORS[k] || "var(--border-strong)" }}
                      />
                      {k} {v}%
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {comp.sectors?.length > 0 && (
            <div className="fpg-sectors">
              <SectorChart sectors={comp.sectors} maxSlices={9} />
            </div>
          )}
        </section>
      )}

      {/* All disclosed holdings */}
      {comp?.top?.length > 0 && (
        <section className="card d-section">
          <div className="d-head">
            <span className="d-title">Holdings</span>
            <span className="d-note">
              {comp.top.length} of {comp.n} disclosed positions · May 2026
            </span>
          </div>
          <div className="fpg-holds">
            {comp.top.map(([holding, v], i) => (
              <div key={`${holding}-${i}`} className="fpg-hold">
                <span className="fpg-hold-rank">{i + 1}</span>
                <span className="fpg-hold-name">{holding}</span>
                <div className="fpg-hold-track">
                  <div
                    className="fpg-hold-fill"
                    style={{ width: `${(v / (comp.top[0]?.[1] || 1)) * 100}%` }}
                  />
                </div>
                <span className="fpg-hold-val">{v}%</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
