import { useEffect, useMemo, useState } from "react";
import { isActive, formatDate, tenureMonths } from "../utils";
import {
  loadDossier,
  formatCrore,
  aumAtMonth,
  fmtYearMonth,
  isoToYearMonth,
} from "../data/dossier";
import { effectiveAum, isOverridden, useAumOverrides } from "../data/aumStore";
import {
  resolveNav,
  windowReturn,
  niftyReturn,
  primaryBenchmarkReturn,
  fmtPct,
  fmtNavDate,
} from "../data/liveData";
import "./ManagerDossier.css";

// Format a month count as "Ny Mmo".
function fmtMonths(m) {
  const y = Math.floor(m / 12);
  const mo = m % 12;
  if (y === 0) return `${mo}mo`;
  if (mo === 0) return `${y}y`;
  return `${y}y ${mo}mo`;
}


// Month-end AUM at the start and end of a manager's tenure, from the fund's
// disclosed AUM history. null when the fund has no
// history in that source. This is historical, sourced AUM — never the
// user-editable current figure.
function tenureAumWindow(points, fromISO, toISO) {
  if (!points || !points.length) return null;
  const s = aumAtMonth(points, isoToYearMonth(fromISO));
  const e = aumAtMonth(points, isoToYearMonth(toISO));
  if (!s || !e) return null;
  return { s, e };
}

// "AUM in tenure" table cell: start → end, month-end AUM.
function TenureAumCell({ points, fromISO, toISO }) {
  const w = tenureAumWindow(points, fromISO, toISO);
  if (!w) return <span className="d-live-dim">—</span>;
  const { s, e } = w;
  const up = e.aum >= s.aum;
  return (
    <span
      className="d-prev-aum"
      title={`Month-end AUM from the fund's disclosed history · ${fmtYearMonth(
        s.ym
      )} → ${fmtYearMonth(e.ym)}${
        s.clamped ? " · start clamped to first available month" : ""
      }`}
    >
      {formatCrore(s.aum)}
      <span className={`d-prev-aum-arrow ${up ? "is-up" : "is-down"}`}>{up ? "↗" : "↘"}</span>
      {formatCrore(e.aum)}
    </span>
  );
}

// ₹ crore delta with a sign, e.g. "+₹233 cr" / "−₹1,061 cr".
function fmtFlow(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : "−"}${formatCrore(Math.abs(v))}`;
}

// Estimated net AUM inflow/outflow over a tenure: the fund's actual AUM
// growth minus the growth its own NAV return alone would explain
// (actual end AUM − start AUM × (1 + NAV return)). Positive = net inflows.
function NetFlowCell({ points, fromISO, toISO, scheme, isin }) {
  const w = tenureAumWindow(points, fromISO, toISO);
  const ret = useTenureReturn(scheme, isin, fromISO, toISO);

  if (!w) return <span className="d-live-dim" title="No disclosed AUM history for this fund">—</span>;
  if (ret.status === "loading") return <span className="d-plain-ret d-live-dim">…</span>;
  if (ret.status !== "ok")
    return (
      <span className="d-live-dim" title="No ISIN-verified NAV history for this window">
        n/a
      </span>
    );

  const { s, e } = w;
  const expected = s.aum * (1 + ret.r.abs);
  const flow = e.aum - expected;
  const up = flow >= 0;
  return (
    <span
      className={`d-plain-ret ${up ? "is-pos" : "is-neg"}`}
      title={`Start AUM ${formatCrore(s.aum)} (${fmtYearMonth(s.ym)}) grown by the manager's own tenure NAV return (${fmtPct(
        ret.r.abs
      )}) implies ${formatCrore(expected)}; actual end AUM was ${formatCrore(e.aum)} (${fmtYearMonth(
        e.ym
      )}). The difference is the estimated net inflow/outflow.`}
    >
      {fmtFlow(flow)}
    </span>
  );
}

function fundVerifyLinks(scheme) {
  const enc = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  return [
    { label: "Value Research", url: enc(`site:valueresearchonline.com ${scheme}`) },
    { label: "Morningstar", url: enc(`site:morningstar.in ${scheme}`) },
    { label: "Returns", url: enc(`${scheme} returns nav performance`) },
  ];
}

/* ── live-data hooks & cells ───────────────────────────────────────────── */

// Manager-tenure return for one fund, computed from ISIN-verified AMFI NAVs.
function useTenureReturn(scheme, isin, fromISO, toISO) {
  const [state, setState] = useState({ status: "loading" });
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    resolveNav(scheme, isin)
      .then((nav) => {
        if (!alive) return;
        const r = windowReturn(nav, fromISO, toISO);
        setState(r ? { status: "ok", r } : { status: "na" });
      })
      .catch(() => alive && setState({ status: "na" }));
    return () => {
      alive = false;
    };
  }, [scheme, isin, fromISO, toISO]);
  return state;
}

function returnTooltip(r, stints) {
  const lines = [
    "Computed from AMFI NAV history (api.mfapi.in), ISIN-verified",
    `NAV window: ${fmtNavDate(r.fromT)} → ${fmtNavDate(r.toT)}`,
    `Absolute: ${fmtPct(r.abs)}`,
  ];
  if (r.cagr != null) lines.push(`Annualised (CAGR): ${fmtPct(r.cagr)} p.a.`);
  if (r.clamped)
    lines.push("Note: online NAV history starts after the tenure start — window clamped");
  if (stints > 1)
    lines.push(`Note: spans ${stints} separate stints (includes the gap between them)`);
  return lines.join("\n");
}

// Green/red pill like the reference's "↗ +18.4%".
function ReturnBadge({ scheme, isin, fromISO, toISO, stints = 1 }) {
  const st = useTenureReturn(scheme, isin, fromISO, toISO);
  if (st.status === "loading") return <span className="d-ret d-ret--wait">…</span>;
  if (st.status !== "ok")
    return (
      <span className="d-ret d-ret--na" title="No ISIN-verified NAV history for this fund/window">
        n/a
      </span>
    );
  const { r } = st;
  const pct = r.cagr != null ? r.cagr : r.abs;
  return (
    <span
      className={`d-ret ${pct >= 0 ? "d-ret--pos" : "d-ret--neg"}`}
      title={returnTooltip(r, stints)}
    >
      <span className="d-ret-arrow">{pct >= 0 ? "↗" : "↘"}</span>
      {fmtPct(pct)}
      {r.cagr != null && <span className="d-ret-pa">p.a.</span>}
    </span>
  );
}

// Plain, icon-free return value — used where the figure sits in its own
// labelled column (e.g. Previous funds' "Manager return" / "Nifty 50 return")
// rather than as a standalone pill badge.
function PlainReturn({ status, r, title }) {
  if (status === "loading") return <span className="d-plain-ret d-live-dim">…</span>;
  if (status !== "ok")
    return (
      <span className="d-plain-ret d-live-dim" title={title}>
        n/a
      </span>
    );
  const pct = r.cagr != null ? r.cagr : r.abs;
  return (
    <span className={`d-plain-ret ${pct >= 0 ? "is-pos" : "is-neg"}`} title={title}>
      {fmtPct(pct)}
      {r.cagr != null ? " p.a." : ""}
    </span>
  );
}

// Manager's tenure return, plain (no icon/pill) — for a labelled column.
function ManagerReturnValue({ scheme, isin, fromISO, toISO, stints = 1 }) {
  const st = useTenureReturn(scheme, isin, fromISO, toISO);
  return (
    <PlainReturn
      status={st.status}
      r={st.r}
      title={
        st.status === "ok"
          ? returnTooltip(st.r, stints)
          : "No ISIN-verified NAV history for this fund/window"
      }
    />
  );
}

// Nifty 50 return over the same tenure window as the row's fund (Yahoo Finance).
function useNiftyReturn(fromISO, toISO) {
  const [state, setState] = useState({ status: "loading" });
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    niftyReturn(fromISO, toISO)
      .then((r) => alive && setState(r ? { status: "ok", r } : { status: "na" }))
      .catch(() => alive && setState({ status: "na" }));
    return () => {
      alive = false;
    };
  }, [fromISO, toISO]);
  return state;
}

function NiftyCell({ fromISO, toISO }) {
  const st = useNiftyReturn(fromISO, toISO);
  if (st.status === "loading") return <span className="d-live-dim">…</span>;
  if (st.status !== "ok")
    return (
      <span className="d-live-dim" title="No Nifty 50 data for this window">
        —
      </span>
    );
  const { r } = st;
  const pct = r.cagr != null ? r.cagr : r.abs;
  return (
    <span
      className={`d-ret ${pct >= 0 ? "d-ret--pos" : "d-ret--neg"}`}
      title={`Nifty 50 (^NSEI) via Yahoo Finance\nWindow: ${fmtNavDate(r.fromT)} → ${fmtNavDate(
        r.toT
      )}\nAbsolute: ${fmtPct(r.abs)}${r.cagr != null ? `\nAnnualised (CAGR): ${fmtPct(r.cagr)} p.a.` : ""}`}
    >
      <span className="d-ret-arrow">{pct >= 0 ? "↗" : "↘"}</span>
      {fmtPct(pct)}
      {r.cagr != null && <span className="d-ret-pa">p.a.</span>}
    </span>
  );
}

// Nifty 50 return, plain (no icon/pill) — for a labelled column.
function NiftyReturnValue({ fromISO, toISO }) {
  const st = useNiftyReturn(fromISO, toISO);
  return (
    <PlainReturn
      status={st.status}
      r={st.r}
      title={
        st.status === "ok"
          ? `Nifty 50 (^NSEI) via Yahoo Finance\nWindow: ${fmtNavDate(st.r.fromT)} → ${fmtNavDate(
              st.r.toT
            )}`
          : "No Nifty 50 data for this window"
      }
    />
  );
}

// Official Primary-benchmark index for this scheme (Benchmark_All_Funds.xlsx),
// with its return over the same tenure window shown in small text underneath.
// The return is computed off an AMFI index fund tracking that index (best
// name match) — a best-effort proxy, since the raw index level isn't fetchable.
function usePrimaryBenchReturn(benchmark, fromISO, toISO) {
  const [state, setState] = useState({ status: "loading" });
  useEffect(() => {
    if (!benchmark) {
      setState({ status: "none" });
      return undefined;
    }
    let alive = true;
    setState({ status: "loading" });
    primaryBenchmarkReturn(benchmark, fromISO, toISO)
      .then((r) => alive && setState({ status: "ok", r }))
      .catch(() => alive && setState({ status: "na" }));
    return () => {
      alive = false;
    };
  }, [benchmark, fromISO, toISO]);
  return state;
}

function PrimaryBenchCell({ benchmark, fromISO, toISO }) {
  const st = usePrimaryBenchReturn(benchmark, fromISO, toISO);
  if (st.status === "none") return <span className="d-live-dim">—</span>;

  const label = benchmark.replace(/-\s*TRI\s*$/i, "").trim();
  return (
    <div className="d-bench-cell">
      <span className="d-bench-cell-name" title={benchmark}>
        {label}
      </span>
      {st.status === "loading" && <span className="d-bench-cell-ret d-live-dim">…</span>}
      {st.status === "na" && (
        <span
          className="d-bench-cell-ret d-live-dim"
          title="No AMFI index-fund proxy found for this benchmark, or no NAV overlap for this window"
        >
          n/a
        </span>
      )}
      {st.status === "ok" &&
        (() => {
          const { r } = st;
          const pct = r.cagr != null ? r.cagr : r.abs;
          return (
            <span
              className={`d-bench-cell-ret ${pct >= 0 ? "is-pos" : "is-neg"}`}
              title={`Best-effort AMFI index-fund proxy for ${benchmark}\nWindow: ${fmtNavDate(
                r.fromT
              )} → ${fmtNavDate(r.toT)}\nAbsolute: ${fmtPct(r.abs)}${
                r.cagr != null ? `\nAnnualised (CAGR): ${fmtPct(r.cagr)} p.a.` : ""
              }`}
            >
              {fmtPct(pct)}
              {r.cagr != null ? " p.a." : ""}
            </span>
          );
        })()}
    </div>
  );
}

/* ── main component ────────────────────────────────────────────────────── */

export default function ManagerDossier({ records, onOpenScheme, onQuickView }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const ovVersion = useAumOverrides(); // re-render when a user edits an AUM

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(false);
    loadDossier()
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  const model = useMemo(() => {
    if (!data || !records) return null;

    // One entry per *stint* (a single from→to row in FM history). Funds managed
    // in several separate stints are NOT collapsed: each stint keeps its own
    // window, tenure and returns, so a gap between stints is never spanned.
    const stints = records.map((r) => {
      const meta = data.meta[r.s] || {};
      return {
        scheme: r.s,
        inception: r.i,
        cat: meta.cat || "—",
        // Current AUM, honouring any user override over the sourced figure.
        aum: effectiveAum(r.s, meta.aum ?? null),
        isin: meta.isin || null,
        // Month-end AUM history (present for most funds in the dump).
        aumPoints: data.aumHistory?.[r.s]?.points || null,
        // Official Primary benchmark index for this scheme (Benchmark_All_Funds.xlsx).
        benchmark: (meta.isin && data.benchmarkPrimary?.[meta.isin]) || null,
        fd: r.fd,
        td: r.td,
        active: isActive(r),
        months: tenureMonths(r.fd, r.td),
      };
    });

    // Number each stint within its fund chronologically (stint 1 = earliest),
    // so multi-stint funds can be labelled "stint k/n".
    const bySchemeStints = {};
    stints.forEach((s) => (bySchemeStints[s.scheme] ||= []).push(s));
    Object.values(bySchemeStints).forEach((arr) => {
      arr.sort((a, b) => a.fd.localeCompare(b.fd));
      arr.forEach((s, i) => {
        s.stintIndex = i + 1;
        s.stintTotal = arr.length;
      });
    });

    const activeStints = stints
      .filter((s) => s.active)
      .sort((a, b) => (b.aum || 0) - (a.aum || 0));
    const pastStints = stints
      .filter((s) => !s.active)
      .sort((a, b) => b.td.localeCompare(a.td));

    // Current AUM managed: sum over *distinct* active funds (a fund with more
    // than one active stint must not be double-counted).
    const activeFundAum = {};
    activeStints.forEach((s) => (activeFundAum[s.scheme] = s.aum));
    const currentAUM = Object.values(activeFundAum).reduce((sum, a) => sum + (a || 0), 0);
    const activeFundCount = Object.keys(activeFundAum).length;

    // Distinct funds (for the verification-links list): one row per fund,
    // marked active if any of its stints is current.
    const fundsMap = {};
    stints.forEach((s) => {
      const f = (fundsMap[s.scheme] ||= { scheme: s.scheme, firstFrom: s.fd, active: false });
      if (s.fd < f.firstFrom) f.firstFrom = s.fd;
      if (s.active) f.active = true;
    });
    const funds = Object.values(fundsMap).sort((a, b) => a.firstFrom.localeCompare(b.firstFrom));

    return {
      funds,
      // Career journey — one timeline entry per stint, newest-first by start date.
      journey: [...stints].sort((a, b) => b.fd.localeCompare(a.fd)),
      activeStints,
      pastStints,
      currentAUM,
      activeFundCount,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, records, ovVersion]);

  if (error)
    return (
      <div className="card d-section dossier--msg">
        Couldn’t load portfolio data. Check that fundMeta.json / composition.json
        are deployed.
      </div>
    );
  if (!model)
    return <div className="card d-section dossier--msg">Loading portfolio data…</div>;

  return (
    <>
      {/* Career journey — one timeline entry per fund managed: the year it was
          taken on, the fund + category, and the live tenure return. */}
      <section className="card d-section">
        <div className="d-head">
          <span className="d-title">Career journey</span>
          <span className="d-note">Funds managed · tenure returns</span>
        </div>
        <div className="d-miles">
          {model.journey.map((s) => (
            <div key={`${s.scheme}@${s.fd}`} className="d-mile">
              <span className="d-mile-rail">
                <span className="d-mile-dot" />
              </span>
              <div className="d-mile-body">
                <span className="d-mile-year">{s.fd.slice(0, 4)}</span>
                <span className="d-mile-text">
                  {s.scheme}
                  {s.active && <span className="d-pill">active</span>}
                  {s.stintTotal > 1 && (
                    <span className="stint-count">
                      stint {s.stintIndex}/{s.stintTotal}
                    </span>
                  )}
                </span>
                <span className="d-mile-sub">
                  <span className="d-mile-cat">{s.cat}</span>
                  <span className="d-mile-period">
                    {formatDate(s.fd)} → {s.active ? "present" : formatDate(s.td)}
                  </span>
                  <ReturnBadge
                    scheme={s.scheme}
                    isin={s.isin}
                    fromISO={s.fd}
                    toISO={s.active ? null : s.td}
                    stints={1}
                  />
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Active funds — table with tenure return + Nifty 50 return over the same window */}
      <section className="card d-section">
        <div className="d-head">
          <span className="d-title">Active funds</span>
          <span className="d-note">
            {model.activeFundCount} fund{model.activeFundCount !== 1 ? "s" : ""} ·
            current AUM managed {formatCrore(model.currentAUM)}
          </span>
        </div>
        {model.activeStints.length === 0 ? (
          <div className="d-empty">No active funds in the records.</div>
        ) : (
          <div className="d-tbl-wrap">
            <table className="d-tbl">
              <thead>
                <tr>
                  <th>Fund name</th>
                  <th>Category</th>
                  <th className="d-tbl-num">AUM (₹ cr)</th>
                  <th>Benchmark used</th>
                  <th>Nifty return</th>
                  <th>Manager tenure return</th>
                  <th>Start date</th>
                  <th>Status</th>
                  <th aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {model.activeStints.map((f) => (
                  <tr
                    key={`${f.scheme}@${f.fd}`}
                    className="d-tbl-row"
                    onClick={onQuickView ? () => onQuickView(f.scheme) : undefined}
                    title={`Quick view: ${f.scheme}`}
                  >
                    <td className="d-tbl-name">
                      {f.scheme}
                      {f.stintTotal > 1 && (
                        <span className="stint-count">
                          stint {f.stintIndex}/{f.stintTotal}
                        </span>
                      )}
                    </td>
                    <td className="d-tbl-muted">{f.cat}</td>
                    <td className="d-tbl-num">
                      {f.aum != null ? Math.round(f.aum).toLocaleString("en-IN") : "—"}
                      {isOverridden(f.scheme) && (
                        <span className="d-aum-edit-dot" title="User-edited AUM">✎</span>
                      )}
                    </td>
                    <td>
                      <PrimaryBenchCell benchmark={f.benchmark} fromISO={f.fd} toISO={null} />
                    </td>
                    <td>
                      <NiftyCell fromISO={f.fd} toISO={null} />
                    </td>
                    <td>
                      <ReturnBadge
                        scheme={f.scheme}
                        isin={f.isin}
                        fromISO={f.fd}
                        toISO={null}
                        stints={1}
                      />
                    </td>
                    <td className="d-tbl-muted">{formatDate(f.fd)}</td>
                    <td>
                      <span className="d-pill d-pill--lone">active</span>
                    </td>
                    <td className="d-tbl-open">
                      <button
                        type="button"
                        className="d-view-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenScheme?.(f.scheme);
                        }}
                        title={`Open the full page for ${f.scheme}`}
                      >
                        View details <span className="d-view-arrow">{"↗"}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="d-foot">
          Tenure return is computed from AMFI NAV history (api.mfapi.in) between the
          manager’s start date and the latest NAV, annualised (CAGR) for periods over a
          year — hover a figure for the exact window. Funds are matched to AMFI records
          by ISIN; unverifiable funds show “n/a”. Nifty return is the Nifty 50 (^NSEI)
          index return over that same window, via Yahoo Finance.{" "}
          <strong>Benchmark used</strong> is each scheme’s official Primary benchmark
          (Benchmark_All_Funds.xlsx); its return below the name is a best-effort proxy
          from an AMFI index fund tracking that same index over the same window.
        </p>
      </section>

      {/* Previous funds — exited stints, one straight-columned table */}
      <section className="card d-section">
        <div className="d-head">
          <span className="d-title">Previous funds</span>
          <span className="d-note">{model.pastStints.length} exited</span>
        </div>
        {model.pastStints.length === 0 ? (
          <div className="d-empty">No exited funds in the records.</div>
        ) : (
          <div className="d-tbl-wrap">
            <table className="d-tbl">
              <thead>
                <tr>
                  <th>Fund name</th>
                  <th>Category</th>
                  <th>Period</th>
                  <th>Tenure</th>
                  <th>AUM in tenure</th>
                  <th>Net AUM inflow</th>
                  <th className="d-tbl-num">Fund size today (₹ cr)</th>
                  <th>Manager return</th>
                  <th>Benchmark used</th>
                  <th>Nifty 50 return</th>
                </tr>
              </thead>
              <tbody>
                {model.pastStints.map((f) => (
                  <tr
                    key={`${f.scheme}@${f.fd}`}
                    className="d-tbl-row"
                    onClick={onQuickView ? () => onQuickView(f.scheme) : undefined}
                    title={`Quick view: ${f.scheme}`}
                  >
                    <td className="d-tbl-name">
                      {f.scheme}
                      {f.stintTotal > 1 && (
                        <span className="stint-count">
                          stint {f.stintIndex}/{f.stintTotal}
                        </span>
                      )}
                    </td>
                    <td className="d-tbl-muted">{f.cat}</td>
                    <td className="d-tbl-muted">
                      {formatDate(f.fd)} → {formatDate(f.td)}
                    </td>
                    <td className="d-tbl-muted">{fmtMonths(f.months)}</td>
                    <td>
                      <TenureAumCell points={f.aumPoints} fromISO={f.fd} toISO={f.td} />
                    </td>
                    <td>
                      <NetFlowCell
                        points={f.aumPoints}
                        fromISO={f.fd}
                        toISO={f.td}
                        scheme={f.scheme}
                        isin={f.isin}
                      />
                    </td>
                    <td className="d-tbl-num">
                      {f.aum != null ? Math.round(f.aum).toLocaleString("en-IN") : "—"}
                      {isOverridden(f.scheme) && (
                        <span className="d-aum-edit-dot" title="User-edited AUM">✎</span>
                      )}
                    </td>
                    <td>
                      <ManagerReturnValue
                        scheme={f.scheme}
                        isin={f.isin}
                        fromISO={f.fd}
                        toISO={f.td}
                        stints={1}
                      />
                    </td>
                    <td>
                      <PrimaryBenchCell benchmark={f.benchmark} fromISO={f.fd} toISO={f.td} />
                    </td>
                    <td>
                      <NiftyReturnValue fromISO={f.fd} toISO={f.td} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="d-foot">
          Each stint is listed separately — a fund managed over two non-consecutive
          spells appears as two rows (labelled “stint k/n”), each with its own period,
          tenure and returns; nothing is spanned across the gap. Returns are computed
          from AMFI NAVs over that stint’s window (annualised for periods over a year).{" "}
          <strong>AUM in tenure</strong> is the fund’s disclosed month-end AUM at the
          start and end of the stint (shown where a monthly AUM history is available). <strong>Net AUM inflow</strong> is the actual AUM change minus the
          growth the fund’s own NAV return would explain on its own — i.e. start AUM ×
          (1 + tenure NAV return) vs. the actual end AUM; the gap is an estimate of net
          investor inflows/outflows, not a disclosed figure. <strong>Manager return</strong>{" "}
          is that stint’s NAV return; <strong>Benchmark used</strong> is the scheme’s
          official Primary benchmark (Benchmark_All_Funds.xlsx) with a best-effort
          AMFI index-fund proxy return alongside it; <strong>Nifty 50 return</strong> is
          the Nifty 50 (^NSEI) index return over the same window, via Yahoo Finance.
        </p>
      </section>

      {/* Performance & history — methodology + outbound verification links */}
      <section className="card d-section">
        <details className="d-perf-details">
          <summary>Performance &amp; history — methodology &amp; verification</summary>
          <p className="d-foot d-foot--lead" style={{ marginTop: "14px" }}>
            Tenure returns above are <strong>computed live from AMFI NAV history</strong>{" "}
            (api.mfapi.in), matched to each fund by ISIN; benchmark figures use the
            selected index fund’s NAV as a proxy over the same window, and the Active
            funds table’s Nifty return uses the actual Nifty 50 (^NSEI) index via Yahoo
            Finance. Figures may differ slightly from official factsheets — cross-check
            any fund here:
          </p>
          <div className="d-perf">
            {model.funds.map((f) => (
              <div key={f.scheme} className="d-perf-row">
                <span className="d-perf-name">
                  {f.scheme}
                  {f.active && <span className="d-pill">active</span>}
                </span>
                <span className="d-perf-links">
                  {fundVerifyLinks(f.scheme).map((l) => (
                    <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer">
                      {l.label}
                      {"↗"}
                    </a>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </details>
      </section>

      <p className="d-source">
        Sources: portfolio &amp; category data dump, as-of {data.asOf} (AUM in ₹ crore,
        point-in-time; holdings %, sector and market-cap from disclosed portfolios) ·
        NAV history: AMFI via api.mfapi.in · Nifty 50 index: Yahoo Finance. Returns are
        computed, not quoted; hover any figure for its exact NAV window.
      </p>

    </>
  );
}
