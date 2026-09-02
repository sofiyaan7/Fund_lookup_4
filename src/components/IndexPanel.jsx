import { useMemo, useState } from "react";
import "./IndexPanel.css";

// Browsable A–Z index used by the Managers / Funds / Companies nav views.
//
// items: [{ label, sub, tags?, value? }]
//   filterOptions — segmented control keeping only items whose `tags` include
//                   the selection. Pass an empty array to hide it.
//   matches       — optional predicate scoping the list to a subset (the
//                   Companies → Funds drill-down passes an AMC test here).
//                   A predicate is used instead of pre-filling the text box,
//                   because deriving a search string from an AMC's display
//                   name matched nothing for houses whose schemes are
//                   abbreviated differently in the data.
export default function IndexPanel({
  title,
  note,
  items,
  onOpen,
  filterOptions,
  filterLabel = "",
  matches = null,
  scopeLabel = null,
  onClearScope = null,
}) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("all");

  const hasTagFilter = Array.isArray(filterOptions) && filterOptions.length > 1;

  const filtered = useMemo(() => {
    let list = items;
    if (matches) list = list.filter(matches);
    if (hasTagFilter && tag !== "all") {
      list = list.filter((it) => (it.tags || []).includes(tag));
    }
    const needle = q.trim().toLowerCase();
    if (needle) list = list.filter((it) => it.label.toLowerCase().includes(needle));
    return list;
  }, [items, q, tag, hasTagFilter, matches]);

  return (
    <div className="card idx">
      <div className="idx-head">
        <div>
          <span className="idx-title">{title}</span>
          <span className="idx-note">{note}</span>
        </div>
        <div className="idx-actions">
          {hasTagFilter && (
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
            type="search"
            className="idx-filter"
            placeholder="Filter…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={`Filter ${title}`}
          />
        </div>
      </div>

      {scopeLabel && onClearScope && (
        <div className="idx-scope">
          <span className="idx-scope-chip">
            {scopeLabel}
            <button
              type="button"
              className="idx-scope-clear"
              onClick={onClearScope}
              aria-label={`Show all, not just ${scopeLabel}`}
              title="Show all funds"
            >
              ×
            </button>
          </span>
          <span className="idx-scope-count">
            {filtered.length} of {items.length}
          </span>
        </div>
      )}

      <div className="idx-body">
        {filtered.length === 0 && <div className="idx-empty">No matches.</div>}
        {filtered.map((it) => (
          <button
            key={it.value || it.label}
            type="button"
            className="idx-row"
            onClick={() => onOpen(it.label, it)}
          >
            <span className="idx-label">{it.label}</span>
            <span className="idx-sub">{it.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
