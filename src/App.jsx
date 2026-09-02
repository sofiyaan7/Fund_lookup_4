import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { loadFundHistory } from "./data/funds";
import { inferAMC, allAMCs, schemeBelongsToAMC, UNCLASSIFIED_AMC } from "./data/amc";
import { loadDossier } from "./data/dossier";
import { classifyCategory, presentAssetClasses } from "./data/assetClass";
import { setDataset, datasetAsOfLabel, isActive } from "./utils";
import Sidebar from "./components/Sidebar";
import SearchBar from "./components/SearchBar";
import ThemeToggle from "./components/ThemeToggle";
import ManagerProfile from "./components/ManagerProfile";
import ManagerDossier from "./components/ManagerDossier";
import FundPage from "./components/FundPage";
import FundPopup from "./components/FundPopup";
import ResultsPanel from "./components/ResultsPanel";
import IndexPanel from "./components/IndexPanel";
import { parseLocation, hrefFor } from "./routing";
import "./App.css";

const DASHBOARD = { nav: "dashboard", mode: "manager", selected: null };
const EMPTY = []; // stable identity, so the memos below don't re-run each render

// Resolve the browser's current URL against the loaded dataset.
function routeFromLocation(data) {
  const r = parseLocation(window.location.pathname, window.location.search, data);
  if (!r) return DASHBOARD;
  if (r.selected) return { nav: DASHBOARD.nav, mode: r.mode, selected: r.selected };
  return { nav: r.nav, mode: "manager", selected: null };
}

export default function App() {
  // The tenure dataset is fetched at runtime (see data/funds.js) rather than
  // bundled, so the whole app waits on it once and everything downstream reads
  // the pre-built indexes instead of re-scanning 5,400 records.
  const [data, setData] = useState(null);
  const [dataError, setDataError] = useState(null);

  const [view, setView] = useState(DASHBOARD); // { nav, mode, selected }
  const [trail, setTrail] = useState([]); // breadcrumb of { mode, selected }
  const [filter, setFilter] = useState("all"); // scheme-view manager-history filter
  const [companyKey, setCompanyKey] = useState(null); // AMC being browsed in Funds
  const [quickView, setQuickView] = useState(null); // scheme shown in the popup
  const [fundMeta, setFundMeta] = useState(null); // { <scheme>: {cat, aum, isin} }

  const { nav, mode, selected } = view;

  /* ── dataset load ────────────────────────────────────────────────────── */

  useEffect(() => {
    let alive = true;
    loadFundHistory()
      .then((d) => {
        if (!alive) return;
        // Teach utils the dataset's own as-of date before anything renders:
        // "is this manager still active?" is answered against the data, not
        // the wall clock.
        setDataset(d.records, d.asOf);
        setData(d);
        const initial = routeFromLocation(d);
        setView(initial);
        window.history.replaceState({ ...initial, trail: [] }, "", hrefFor(initial));
      })
      .catch((e) => alive && setDataError(e));
    return () => {
      alive = false;
    };
  }, []);

  /* ── navigation ──────────────────────────────────────────────────────── */

  // Every user navigation goes through here, and every one pushes a real
  // history entry so the browser Back button walks back through the app
  // instead of leaving it. (This used to use replaceState, so in-app
  // navigation created no history at all and Back jumped clean out.)
  const go = useCallback((next, { trail: nextTrail = [], push = true } = {}) => {
    setView(next);
    setTrail(nextTrail);
    setFilter("all");
    if (!push) return;
    const href = hrefFor(next);
    const here = window.location.pathname + window.location.search;
    if (here !== href) window.history.pushState({ ...next, trail: nextTrail }, "", href);
    else window.history.replaceState({ ...next, trail: nextTrail }, "", href);
  }, []);

  const dataRef = useRef(null);
  dataRef.current = data;

  useEffect(() => {
    const onPopState = (e) => {
      const d = dataRef.current;
      if (!d) return;
      const st = e.state;
      const next =
        st && (st.selected || st.nav)
          ? { nav: st.nav || "dashboard", mode: st.mode || "manager", selected: st.selected || null }
          : routeFromLocation(d);
      setView(next);
      setTrail(Array.isArray(st?.trail) ? st.trail : []);
      setFilter("all");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Browser tab title follows the selection; the sidebar brand stays stable.
  useEffect(() => {
    document.title = selected
      ? `${selected} · Fund & Manager Lookup`
      : "Fund & Manager Lookup";
  }, [selected]);

  /* ── fundMeta (category / AUM / ISIN per scheme) ─────────────────────── */

  // Needed for the Managers asset-class filter; loadDossier() caches
  // internally, so revisiting a view is free.
  useEffect(() => {
    if (nav !== "managers" || fundMeta) return;
    let alive = true;
    loadDossier()
      .then((d) => alive && setFundMeta(d.meta))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [nav, fundMeta]);

  /* ── derived indexes ─────────────────────────────────────────────────── */

  const managers = data?.managers ?? EMPTY;
  const schemes = data?.schemes ?? EMPTY;

  const searchItems = useMemo(
    () => [
      ...managers.map((label) => ({ label, type: "manager" })),
      ...schemes.map((label) => ({ label, type: "scheme" })),
    ],
    [managers, schemes]
  );

  const managerIndex = useMemo(() => {
    if (!data) return [];
    return managers.map((n) => {
      const recs = data.byManager.get(n) || [];
      const funds = new Set(recs.map((r) => r.s));
      const active = new Set(recs.filter((r) => isActive(r)).map((r) => r.s));
      const tags = fundMeta
        ? [...new Set(recs.map((r) => classifyCategory(fundMeta[r.s]?.cat)))]
        : [];
      return {
        label: n,
        sub:
          `${funds.size} fund${funds.size > 1 ? "s" : ""}` +
          (active.size ? ` · ${active.size} current` : ""),
        tags,
      };
    });
  }, [data, managers, fundMeta]);

  const fundIndex = useMemo(() => {
    if (!data) return [];
    return schemes.map((s) => {
      const recs = data.byScheme.get(s) || [];
      const inception = recs[0]?.i;
      const current = [...new Set(recs.filter((r) => isActive(r)).map((r) => r.f))];
      return {
        label: s,
        sub:
          (inception ? `since ${inception.slice(0, 4)}` : "") +
          (current.length ? ` · ${current.join(", ")}` : ""),
        amcKey: inferAMC(s)?.key || null,
      };
    });
  }, [data, schemes]);

  // Fund houses (AMCs) inferred from scheme-name prefixes, with fund and
  // manager counts derived from the records.
  const companyIndex = useMemo(() => {
    if (!data) return [];
    const map = new Map();
    schemes.forEach((s) => {
      const amc = inferAMC(s);
      const key = amc ? amc.key : UNCLASSIFIED_AMC;
      const name = amc ? amc.name : UNCLASSIFIED_AMC;
      if (!map.has(key)) map.set(key, { key, name, funds: 0, managers: new Set() });
      const entry = map.get(key);
      entry.funds += 1;
      (data.byScheme.get(s) || []).forEach((r) => entry.managers.add(r.f));
    });
    return [...map.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => ({
        label: e.name,
        value: e.key,
        sub: `${e.funds} fund${e.funds > 1 ? "s" : ""} · ${e.managers.size} manager${
          e.managers.size > 1 ? "s" : ""
        }`,
      }));
  }, [data, schemes]);

  // Only offer asset-class filters that actually occur in the data — the fixed
  // Equity/Debt/Hybrid list gave two buttons that could never match, since
  // every scheme in this dump is an equity one.
  const assetClasses = useMemo(() => presentAssetClasses(fundMeta), [fundMeta]);

  const results = useMemo(() => {
    if (!data || !selected) return [];
    return (mode === "manager" ? data.byManager.get(selected) : data.byScheme.get(selected)) || [];
  }, [data, selected, mode]);

  /* ── handlers ────────────────────────────────────────────────────────── */

  const handleSearchSelect = useCallback(
    (item) => {
      if (!item) {
        go({ ...DASHBOARD, nav });
        return;
      }
      go({ nav: "dashboard", mode: item.type, selected: item.label });
    },
    [go, nav]
  );

  const handleNav = useCallback(
    (key) => {
      setCompanyKey(null);
      go({ nav: key, mode: "manager", selected: null });
    },
    [go]
  );

  // Companies → Funds drill-down. Carries the AMC's stable key, not a
  // display-name fragment: deriving a text filter from the name silently
  // broke for every house whose schemes are abbreviated differently
  // ("ICICI Prudential Mutual Fund" → 82 funds → "No matches").
  const openCompany = useCallback(
    (key) => {
      setCompanyKey(key === UNCLASSIFIED_AMC ? null : key);
      go({ nav: "funds", mode: "manager", selected: null });
    },
    [go]
  );

  // Cross-link navigation: push the current view onto the trail and open
  // the target, switching mode (manager <-> scheme) as needed.
  const navigate = useCallback(
    (nextMode, nextSelected) => {
      const nextTrail = selected ? [...trail, { mode, selected }] : trail;
      go({ nav: "dashboard", mode: nextMode, selected: nextSelected }, { trail: nextTrail });
    },
    [go, mode, selected, trail]
  );

  const openScheme = useCallback(
    (s) => {
      setQuickView(null);
      navigate("scheme", s);
    },
    [navigate]
  );
  const openManager = useCallback(
    (m) => {
      setQuickView(null);
      navigate("manager", m);
    },
    [navigate]
  );

  // Quick-view popup: every in-page fund-name click opens this first; the
  // popup's "Open full page" then navigates to the full fund view.
  const openQuickView = useCallback((s) => setQuickView(s), []);

  const jumpToTrail = useCallback(
    (idx) => {
      const item = trail[idx];
      if (!item) return;
      go(
        { nav: "dashboard", mode: item.mode, selected: item.selected },
        { trail: trail.slice(0, idx) }
      );
    },
    [go, trail]
  );

  const selectFilter = useCallback((next) => setFilter(next), []);

  // A few recognizable managers to seed the empty state. The curated names are
  // kept (they are the point — a stranger recognises them), but only those
  // actually present in the loaded dataset are offered, and the fallback is the
  // managers currently running the most funds rather than whoever sorts first
  // alphabetically.
  const exampleChips = useMemo(() => {
    if (!data) return [];
    const preferred = [
      "Sankaran Naren",
      "Roshi Jain",
      "Harsha Upadhyaya",
      "Neelesh Surana",
      "Rajeev Thakkar",
    ];
    const have = new Set(managers);
    const picks = preferred.filter((m) => have.has(m));
    if (picks.length >= 3) return picks;
    return managers
      .map((m) => {
        const recs = data.byManager.get(m) || [];
        return { m, active: new Set(recs.filter((r) => isActive(r)).map((r) => r.s)).size };
      })
      .sort((a, b) => b.active - a.active || a.m.localeCompare(b.m))
      .slice(0, 5)
      .map((x) => x.m);
  }, [data, managers]);

  /* ── render ──────────────────────────────────────────────────────────── */

  if (dataError) {
    return (
      <div className="shell">
        <div className="main">
          <div className="main-inner">
            <div className="card boot-msg">
              <h2>Couldn’t load the fund-manager dataset</h2>
              <p>
                <code>fundHistory.json</code> could not be fetched
                {dataError?.message ? ` (${dataError.message})` : ""}. Check that it is
                deployed alongside the app.
              </p>
              <button type="button" className="example-chip" onClick={() => window.location.reload()}>
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="shell">
        <div className="main">
          <div className="main-inner">
            <div className="card boot-msg boot-msg--load">
              <span className="boot-spinner" aria-hidden="true" />
              <p>Loading fund &amp; manager records…</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const companyName = companyKey
    ? allAMCs().find((a) => a.key === companyKey)?.name || null
    : null;

  return (
    <div className="shell">
      <Sidebar current={nav} onNav={handleNav} />

      <div className="main">
        <div className="main-inner">
          <header className="topbar">
            <SearchBar
              items={searchItems}
              value={selected}
              placeholder="Search a fund or a fund manager…"
              onSelect={handleSearchSelect}
            />
            <ThemeToggle />
          </header>

          {selected && trail.length > 0 && (
            <nav className="trail" aria-label="Navigation history">
              {trail.map((h, i) => (
                <span key={`${h.mode}:${h.selected}:${i}`} className="trail-crumb">
                  <button
                    type="button"
                    className="trail-link"
                    onClick={() => jumpToTrail(i)}
                    title={`Back to ${h.selected}`}
                  >
                    {h.selected}
                  </button>
                  <span className="trail-sep">{"›"}</span>
                </span>
              ))}
              <span className="trail-current">{selected}</span>
            </nav>
          )}

          {selected ? (
            mode === "manager" ? (
              <div className="stack">
                <ManagerProfile
                  name={selected}
                  records={results}
                  onOpenScheme={openQuickView}
                >
                  <ManagerDossier
                    records={results}
                    onOpenScheme={openScheme}
                    onQuickView={openQuickView}
                  />
                </ManagerProfile>
              </div>
            ) : (
              <div className="stack">
                <FundPage
                  name={selected}
                  records={results}
                  onOpenManager={openManager}
                  onOpenCompany={openCompany}
                />
                <ResultsPanel
                  mode="scheme"
                  results={results}
                  filter={filter}
                  onFilterChange={selectFilter}
                  onOpenManager={openManager}
                />
              </div>
            )
          ) : nav === "managers" ? (
            <IndexPanel
              title="All managers"
              note={`${managers.length} fund managers · records as at ${datasetAsOfLabel()}`}
              items={managerIndex}
              onOpen={(n) => handleSearchSelect({ label: n, type: "manager" })}
              filterOptions={assetClasses}
              filterLabel="asset classes"
            />
          ) : nav === "funds" ? (
            <IndexPanel
              key={`funds:${companyKey || "all"}`}
              title={companyName ? `${companyName.replace(" Mutual Fund", "")} funds` : "All funds"}
              note={
                companyName
                  ? `Funds of ${companyName} · records as at ${datasetAsOfLabel()}`
                  : `${schemes.length} schemes · records as at ${datasetAsOfLabel()}`
              }
              items={fundIndex}
              scopeLabel={companyName || null}
              onClearScope={companyKey ? () => setCompanyKey(null) : null}
              matches={
                companyKey ? (it) => schemeBelongsToAMC(it.label, companyKey) : null
              }
              onOpen={(s) => handleSearchSelect({ label: s, type: "scheme" })}
            />
          ) : nav === "companies" ? (
            <IndexPanel
              title="Fund houses"
              note="AMCs inferred from scheme names · click one to browse its funds"
              items={companyIndex}
              onOpen={(label, item) => openCompany(item?.value || label)}
            />
          ) : (
            <div className="empty-state">
              <p className="empty-title">
                Look up a fund manager to see every scheme they’ve run — or a fund
                to see its full manager lineage.
              </p>
              <p className="empty-sub">
                {managers.length} managers · {schemes.length} schemes · records as at{" "}
                {datasetAsOfLabel()}
              </p>
              {exampleChips.length > 0 && (
                <div className="empty-examples">
                  <span className="empty-examples-label">Try</span>
                  {exampleChips.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      className="example-chip"
                      onClick={() =>
                        handleSearchSelect({ label: ex, type: "manager" })
                      }
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {quickView && (
        <FundPopup
          scheme={quickView}
          onClose={() => setQuickView(null)}
          onOpenFull={() => openScheme(quickView)}
        />
      )}
    </div>
  );
}
