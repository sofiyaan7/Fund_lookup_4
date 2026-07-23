import { useState, useMemo, useCallback, useEffect } from "react";
import FUND_DATA from "./data/funds";
import { inferAMC } from "./data/amc";
import { loadDossier } from "./data/dossier";
import { classifyCategory, ASSET_CLASSES } from "./data/assetClass";
import Sidebar from "./components/Sidebar";
import SearchBar from "./components/SearchBar";
import ThemeToggle from "./components/ThemeToggle";
import ManagerProfile from "./components/ManagerProfile";
import ManagerDossier from "./components/ManagerDossier";
import FundPage from "./components/FundPage";
import FundPopup from "./components/FundPopup";
import ResultsPanel from "./components/ResultsPanel";
import IndexPanel from "./components/IndexPanel";
import { parseLocation, navHref, schemeHref, managerHref } from "./routing";
import "./App.css";

// Resolved once at module load — the initial state on first paint mirrors
// whatever fund/manager/nav the URL (or ?fund=/?manager= query param) points
// to, so a deep link from another site lands directly on that page.
const initialRoute =
  typeof window !== "undefined"
    ? parseLocation(window.location.pathname, window.location.search)
    : null;

export default function App() {
  const [nav, setNav] = useState(initialRoute?.nav || "dashboard"); // "dashboard" | "managers" | "funds" | "companies"
  const [mode, setMode] = useState(initialRoute?.mode || "manager"); // type of the selected entity
  const [selected, setSelected] = useState(initialRoute?.selected || null);
  const [filter, setFilter] = useState("all"); // scheme-view manager-history filter
  const [history, setHistory] = useState([]); // breadcrumb trail of { mode, selected }
  const [fundsPrefill, setFundsPrefill] = useState(""); // pre-filter when arriving from Companies
  const [quickView, setQuickView] = useState(null); // scheme name shown in the quick-view popup
  const [fundMeta, setFundMeta] = useState(null); // { <scheme>: {cat, aum, isin} }, for the Managers asset-class filter

  // fundMeta.json (category per scheme) is only needed for the Managers
  // asset-class filter — fetched on first visit to that view, not upfront.
  // loadDossier() caches internally, so switching views again is free.
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

  const managers = useMemo(
    () => [...new Set(FUND_DATA.map((r) => r.f))].sort(),
    []
  );
  const schemes = useMemo(
    () => [...new Set(FUND_DATA.map((r) => r.s))].sort(),
    []
  );

  // Unified search pool: managers first, then funds. Each row is tagged so the
  // app can switch into the right view on select.
  const searchItems = useMemo(
    () => [
      ...managers.map((label) => ({ label, type: "manager" })),
      ...schemes.map((label) => ({ label, type: "scheme" })),
    ],
    [managers, schemes]
  );

  // Index lists for the Managers / Funds nav views.
  const managerIndex = useMemo(() => {
    const counts = {};
    const assetClasses = {}; // manager -> Set of asset classes across their funds
    FUND_DATA.forEach((r) => {
      (counts[r.f] = counts[r.f] || new Set()).add(r.s);
      if (fundMeta) {
        const ac = classifyCategory(fundMeta[r.s]?.cat);
        (assetClasses[r.f] ||= new Set()).add(ac);
      }
    });
    return managers.map((n) => ({
      label: n,
      sub: `${counts[n].size} fund${counts[n].size > 1 ? "s" : ""}`,
      tags: assetClasses[n] ? [...assetClasses[n]] : [],
    }));
  }, [managers, fundMeta]);

  const fundIndex = useMemo(() => {
    const inception = {};
    FUND_DATA.forEach((r) => {
      if (!inception[r.s]) inception[r.s] = r.i;
    });
    return schemes.map((s) => ({
      label: s,
      sub: inception[s] ? `since ${inception[s].slice(0, 4)}` : "",
    }));
  }, [schemes]);

  // Fund houses (AMCs) inferred from scheme-name prefixes, with fund and
  // manager counts derived from the records.
  const companyIndex = useMemo(() => {
    const schemeAmc = {};
    schemes.forEach((s) => {
      const a = inferAMC(s);
      schemeAmc[s] = a ? a.name : "Other / unclassified";
    });
    const map = {};
    schemes.forEach((s) => {
      const k = schemeAmc[s];
      if (!map[k]) map[k] = { funds: 0, managers: new Set() };
      map[k].funds += 1;
    });
    FUND_DATA.forEach((r) => {
      map[schemeAmc[r.s]].managers.add(r.f);
    });
    return Object.keys(map)
      .sort()
      .map((k) => ({
        label: k,
        sub: `${map[k].funds} fund${map[k].funds > 1 ? "s" : ""} · ${map[k].managers.size} managers`,
      }));
  }, [schemes]);

  // Browser tab title follows the selection; the sidebar brand stays stable.
  useEffect(() => {
    document.title = selected
      ? `${selected} · Fund & Manager Lookup`
      : "Fund & Manager Lookup";
  }, [selected]);

  // Keep the address bar in sync with the current view so a fund/manager
  // page can be copied out as a shareable/deep-linkable URL, e.g.
  // /fund/<Scheme%20Name> or /manager/<Manager%20Name>. Uses replaceState
  // (not pushState) so this doesn't fight with the app's own breadcrumb
  // trail — the browser back button leaves this app entirely rather than
  // stepping through internal navigation.
  useEffect(() => {
    const path = selected
      ? mode === "manager"
        ? managerHref(selected)
        : schemeHref(selected)
      : navHref(nav);
    if (window.location.pathname + window.location.search !== path) {
      window.history.replaceState(null, "", path);
    }
  }, [nav, mode, selected]);

  // Support the browser back/forward buttons for the one entry created on
  // initial load vs. a later deep link (e.g. user pastes a different
  // /fund/... URL and hits back).
  useEffect(() => {
    const onPopState = () => {
      const route = parseLocation(
        window.location.pathname,
        window.location.search
      );
      setHistory([]);
      if (route?.selected) {
        setMode(route.mode);
        setSelected(route.selected);
      } else {
        setSelected(null);
        setNav(route?.nav || "dashboard");
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const results = useMemo(() => {
    if (!selected) return [];
    return mode === "manager"
      ? FUND_DATA.filter((r) => r.f === selected)
      : FUND_DATA.filter((r) => r.s === selected);
  }, [selected, mode]);

  // Fresh search from the search box — reset filters and the trail. Accepts a
  // { label, type } item (or null to clear) and switches view to its type.
  const handleSearchSelect = useCallback((item) => {
    if (!item) {
      setSelected(null);
      return;
    }
    setMode(item.type);
    setSelected(item.label);
    setFilter("all");
    setHistory([]);
  }, []);

  const handleNav = useCallback((key) => {
    setNav(key);
    setSelected(null);
    setFilter("all");
    setHistory([]);
    setFundsPrefill("");
  }, []);

  // Companies → Funds drill-down: open the funds index pre-filtered to the AMC.
  const openCompany = useCallback((name) => {
    setFundsPrefill(
      name === "Other / unclassified" ? "" : name.replace(" Mutual Fund", "")
    );
    setNav("funds");
    setSelected(null);
    setHistory([]);
  }, []);

  // Cross-link navigation: push the current view onto the trail and open
  // the target, switching mode (manager <-> scheme) as needed.
  const navigate = useCallback(
    (nextMode, nextSelected) => {
      setHistory((h) => (selected ? [...h, { mode, selected }] : h));
      setMode(nextMode);
      setSelected(nextSelected);
      setFilter("all");
    },
    [mode, selected]
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

  // Jump back to an earlier point in the breadcrumb trail.
  const jumpToHistory = useCallback(
    (idx) => {
      const item = history[idx];
      if (!item) return;
      setMode(item.mode);
      setSelected(item.selected);
      setHistory(history.slice(0, idx));
      setFilter("all");
    },
    [history]
  );

  // Direct set for the All/Active control inside the manager-history panel.
  const selectFilter = useCallback((next) => {
    setFilter(next);
  }, []);

  // A few recognizable managers to seed the empty state.
  const exampleChips = useMemo(() => {
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
    return managers.slice(0, 5);
  }, [managers]);

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

          {selected && history.length > 0 && (
            <nav className="trail" aria-label="Navigation history">
              {history.map((h, i) => (
                <span key={i} className="trail-crumb">
                  <button
                    type="button"
                    className="trail-link"
                    onClick={() => jumpToHistory(i)}
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
              note={`${managers.length} fund managers in the records`}
              items={managerIndex}
              onOpen={(n) => handleSearchSelect({ label: n, type: "manager" })}
              filterOptions={ASSET_CLASSES}
              filterLabel="asset classes"
            />
          ) : nav === "funds" ? (
            <IndexPanel
              key={`funds:${fundsPrefill}`}
              title="All funds"
              note={`${schemes.length} schemes in the records`}
              items={fundIndex}
              initialQuery={fundsPrefill}
              onOpen={(s) => handleSearchSelect({ label: s, type: "scheme" })}
            />
          ) : nav === "companies" ? (
            <IndexPanel
              title="Fund houses"
              note="AMCs inferred from scheme names · click one to browse its funds"
              items={companyIndex}
              onOpen={openCompany}
            />
          ) : (
            <div className="empty-state">
              <p className="empty-title">
                Look up a fund manager to see every scheme they’ve run — or a fund
                to see its full manager lineage.
              </p>
              <p className="empty-sub">
                {managers.length} managers · {schemes.length} schemes
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
