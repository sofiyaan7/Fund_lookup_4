import { useEffect, useRef } from "react";
import { formatDate, calcTenure, isActive } from "../utils";
import "./ResultsPanel.css";

function Tag({ label, value }) {
  return (
    <span className="tag">
      <span className="tag-label">{label}</span> {value}
    </span>
  );
}

function ActiveBadge() {
  return <span className="active-badge">active</span>;
}

function TenureRow({ from, to }) {
  return (
    <div className="tenure-row">
      <Tag label="From" value={formatDate(from)} />
      <span className="arrow">{"→"}</span>
      <Tag label="To" value={formatDate(to)} />
      <span className="tenure-val">{calcTenure(from, to)}</span>
      {isActive(to) && <ActiveBadge />}
    </div>
  );
}

// A name that links across to the connected entity (fund <-> manager).
function LinkName({ children, onClick, title }) {
  return (
    <button type="button" className="link-name" onClick={onClick} title={title}>
      <span>{children}</span>
      <span className="link-arrow">{"↗"}</span>
    </button>
  );
}

// Small segmented All / Active filter shown in the panel header.
function FilterToggle({ filter, onChange }) {
  if (!onChange) return null;
  return (
    <div className="seg seg-sm" role="group" aria-label="Filter">
      <button
        type="button"
        className={`seg-btn ${filter === "all" ? "seg-on" : ""}`}
        onClick={() => onChange("all")}
      >
        All
      </button>
      <button
        type="button"
        className={`seg-btn ${filter === "active" ? "seg-on" : ""}`}
        onClick={() => onChange("active")}
      >
        Active
      </button>
    </div>
  );
}

export default function ResultsPanel({
  mode,
  results,
  filter = "all",
  onFilterChange,
  highlight,
  onOpenScheme,
  onOpenManager,
}) {
  const bodyRef = useRef(null);

  // Smoothly scroll the highlighted row into view when set.
  useEffect(() => {
    if (!highlight || !bodyRef.current) return;
    const el = bodyRef.current.querySelector('[data-highlighted="true"]');
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight, mode, results]);

  if (!results || results.length === 0) return null;

  if (mode === "manager") {
    // Group by scheme so multiple stints on the same fund collapse together.
    const byScheme = {};
    results.forEach((r) => {
      if (!byScheme[r.s])
        byScheme[r.s] = { scheme: r.s, inception: r.i, entries: [] };
      byScheme[r.s].entries.push(r);
    });
    let groups = Object.values(byScheme).sort((a, b) =>
      a.scheme.localeCompare(b.scheme)
    );

    const totalCount = groups.length;
    if (filter === "active") {
      groups = groups.filter((g) => g.entries.some((e) => isActive(e.td)));
    }

    return (
      <div className="results-panel">
        <div className="results-header">
          <div className="results-heading">
            <span className="results-label">
              {filter === "active" ? "Active Funds" : "Funds Managed"}
            </span>
            <span className="results-sub">Click a fund to open its history</span>
          </div>
          <div className="results-actions">
            <FilterToggle filter={filter} onChange={onFilterChange} />
            <span className="results-count">
              {filter === "active"
                ? `${groups.length} of ${totalCount}`
                : `${groups.length} funds`}
            </span>
          </div>
        </div>
        <div className="results-body" ref={bodyRef}>
          {groups.length === 0 && (
            <div className="results-empty">No active funds for this manager.</div>
          )}
          {groups.map((group, i) => {
            const active = group.entries.some((e) => isActive(e.td));
            const highlighted = highlight === group.scheme;
            return (
              <div
                key={i}
                className={`result-row ${highlighted ? "result-row--highlight" : ""}`}
                data-highlighted={highlighted ? "true" : undefined}
              >
                <div className="row-head">
                  <LinkName
                    onClick={() => onOpenScheme?.(group.scheme)}
                    title={`See all managers of ${group.scheme}`}
                  >
                    {group.scheme}
                  </LinkName>
                  {active && <ActiveBadge />}
                  {group.entries.length > 1 && (
                    <span className="stint-count">
                      {group.entries.length} stints
                    </span>
                  )}
                </div>
                <div className="meta-row">
                  <Tag label="Inception" value={formatDate(group.inception)} />
                  {group.entries.map((e, j) => (
                    <TenureRow key={j} from={e.fd} to={e.td} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // mode === "scheme" — show manager history.
  let sorted = [...results].sort((a, b) => new Date(b.fd) - new Date(a.fd));
  const totalCount = sorted.length;
  if (filter === "active") {
    sorted = sorted.filter((r) => isActive(r.td));
  }

  const inception = results[0]?.i;
  const currentManagers = [
    ...new Set(results.filter((r) => isActive(r.td)).map((r) => r.f)),
  ];

  return (
    <div className="results-panel">
      <div className="results-header">
        <div className="results-heading">
          <span className="results-label">
            {filter === "active" ? "Current Managers" : "Manager History"}
          </span>
          <span className="results-sub">
            {inception ? `Inception ${formatDate(inception)} · ` : ""}
            Click a manager to see their funds
          </span>
        </div>
        <div className="results-actions">
          <FilterToggle filter={filter} onChange={onFilterChange} />
          <span className="results-count">
            {filter === "active"
              ? `${sorted.length} of ${totalCount}`
              : `${sorted.length} records`}
          </span>
        </div>
      </div>
      <div className="results-body" ref={bodyRef}>
        {sorted.length === 0 && (
          <div className="results-empty">No active manager on this fund.</div>
        )}
        {sorted.map((r, i) => {
          const highlighted = highlight === r.f;
          return (
            <div
              key={i}
              className={`result-row-flat ${highlighted ? "result-row--highlight" : ""}`}
              data-highlighted={highlighted ? "true" : undefined}
            >
              <div className="row-head row-head--flat">
                <LinkName
                  onClick={() => onOpenManager?.(r.f)}
                  title={`See all funds run by ${r.f}`}
                >
                  {r.f}
                </LinkName>
                {currentManagers.includes(r.f) && isActive(r.td) && (
                  <span className="current-tag">current</span>
                )}
              </div>
              <TenureRow from={r.fd} to={r.td} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
