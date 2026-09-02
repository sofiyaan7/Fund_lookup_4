import { useMemo, useState } from "react";
import "./SectorChart.css";

const SLICE_COLORS = [
  "#3fb950",
  "#2f81f7",
  "#d29922",
  "#a371f7",
  "#39c5cf",
  "#f778ba",
  "#f0883e",
  "#e3b341",
  "#56d364",
  "#79c0ff",
  "#8b949e",
];

const OTHER_COLOR = "#8b949e";

// SVG donut slice for [a0, a1) in turns (0..1).
function arcPath(cx, cy, r, ir, a0, a1) {
  const TAU = Math.PI * 2;
  if (a1 - a0 >= 0.9999) a1 = a0 + 0.9999; // avoid degenerate full circle
  const p = (a, rad) => [cx + rad * Math.sin(a * TAU), cy - rad * Math.cos(a * TAU)];
  const [x0, y0] = p(a0, r);
  const [x1, y1] = p(a1, r);
  const [x2, y2] = p(a1, ir);
  const [x3, y3] = p(a0, ir);
  const large = a1 - a0 > 0.5 ? 1 : 0;
  return `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${ir},${ir} 0 ${large} 0 ${x3},${y3} Z`;
}

// Sector-allocation chart with a Pie/Bars toggle. `sectors` is the raw
// [[name, pct], …] list from composition.json; up to `maxSlices` are drawn and
// the remainder is grouped into "Other / cash / debt" so the pie sums to 100.
export default function SectorChart({ sectors = [], maxSlices = 9 }) {
  const [chart, setChart] = useState("pie");

  const slices = useMemo(() => {
    const top = sectors.slice(0, maxSlices).map(([name, v], i) => ({
      name,
      v,
      color: SLICE_COLORS[i % SLICE_COLORS.length],
    }));
    const shown = top.reduce((s, x) => s + x.v, 0);
    const rest = Math.max(0, 100 - shown);
    if (rest > 0.5) top.push({ name: "Other / cash / debt", v: rest, color: OTHER_COLOR });
    return top;
  }, [sectors, maxSlices]);

  const total = slices.reduce((s, x) => s + x.v, 0) || 1;
  let acc = 0;

  // With no sector rows the "remainder" logic would render a single grey
  // full-circle labelled "Other / cash / debt", which reads as a real 100%
  // allocation rather than as missing data.
  if (!sectors.length) {
    return (
      <div className="sc">
        <div className="sc-head">
          <span className="sc-label">Sector analysis</span>
        </div>
        <div className="sc-empty">No sector breakdown disclosed for this scheme.</div>
      </div>
    );
  }

  return (
    <div className="sc">
      <div className="sc-head">
        <span className="sc-label">Sector analysis</span>
        <div className="seg seg-sm" role="group" aria-label="Chart type">
          <button
            type="button"
            className={`seg-btn ${chart === "pie" ? "seg-on" : ""}`}
            onClick={() => setChart("pie")}
          >
            Pie
          </button>
          <button
            type="button"
            className={`seg-btn ${chart === "bars" ? "seg-on" : ""}`}
            onClick={() => setChart("bars")}
          >
            Bars
          </button>
        </div>
      </div>

      {chart === "pie" ? (
        <div className="sc-pie-wrap">
          <svg viewBox="0 0 200 200" className="sc-pie" aria-hidden="true">
            {slices.map((s) => {
              const a0 = acc / total;
              acc += s.v;
              const a1 = acc / total;
              return (
                <path key={s.name} d={arcPath(100, 100, 88, 52, a0, a1)} fill={s.color}>
                  <title>{`${s.name} ${s.v.toFixed(1)}%`}</title>
                </path>
              );
            })}
          </svg>
          <div className="sc-legend">
            {slices.map((s) => (
              <div key={s.name} className="sc-leg">
                <span className="sc-swatch" style={{ background: s.color }} />
                <span className="sc-leg-name">{s.name}</span>
                <span className="sc-leg-val">{s.v.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="sc-bars">
          {slices.map((s) => (
            <div key={s.name} className="sc-bar-row">
              <span className="sc-leg-name">{s.name}</span>
              <div className="sc-bar-track">
                <div
                  className="sc-bar-fill"
                  style={{ width: `${(s.v / (slices[0]?.v || 1)) * 100}%`, background: s.color }}
                />
              </div>
              <span className="sc-leg-val">{s.v.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
