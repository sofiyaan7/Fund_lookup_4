import { useMemo, useState } from "react";
import "./IndexPanel.css";

// Browsable A–Z index used by the Managers / Funds / Companies nav views.
// items: [{ label, sub, tags? }]. `filterOptions` (e.g. asset classes) adds a
// segmented control that keeps only items whose `tags` include the selection.
export default function IndexPanel({
  title,
  note,
  items,
  onOpen,
  initialQuery = "",
  filterOptions,
  filterLabel = "",
}) {
  const [q, setQ] = useState(initialQuery);
  const [tag, setTag] = useState("all");

  const filtered = useMemo(() => {
    let list = items;
    if (filterOptions && tag !== "all") {
      list = list.filter((it) => (it.tags || []).includes(tag));
    }
    const needle = q.trim().toLowerCase();
    if (needle) list = list.filter((it) => it.label.toLowerCase().includes(needle));
    return list;
  }, [items, q, tag, filterOptions]);

  return (
    <div className="card idx">
      <div className="idx-head">
        <div>
          <span className="idx-title">{title}</span>
          <span className="idx-note">{note}</span>
        </div>
        <div className="idx-actions">
          {filterOptions && (
            <div className="seg" role="group" aria-label={`Filter by ${filterLabel}`}>
              <button
                type="button"
                className={`seg-btn ${tag === "all" ? "seg-on" : ""}`}
                onClick={() => setTag("all")}
              >
                All
              </button>
              {filterOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`seg-btn ${tag === opt ? "seg-on" : ""}`}
                  onClick={() => setTag(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
          <input
            type="text"
            className="idx-filter"
            placeholder="Filter…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      <div className="idx-body">
        {filtered.length === 0 && <div className="idx-empty">No matches.</div>}
        {filtered.map((it) => (
          <button
            key={it.label}
            type="button"
            className="idx-row"
            onClick={() => onOpen(it.label)}
          >
            <span className="idx-label">{it.label}</span>
            <span className="idx-sub">{it.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
