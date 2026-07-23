import { useState, useRef, useEffect, useMemo } from "react";
import "./SearchBar.css";

// Unified search across both managers and funds. `items` is an array of
// { label, type } where type is "manager" | "scheme". Selecting a row hands the
// whole item back so the app knows which kind of entity was chosen.
export default function SearchBar({ items, placeholder, onSelect, value }) {
  const [query, setQuery] = useState(value || "");
  const [showDrop, setShowDrop] = useState(false);
  const inputRef = useRef(null);
  const dropRef = useRef(null);

  // Keep the input in sync when the selection changes from outside
  // (cross-link navigation or breadcrumb jumps).
  useEffect(() => {
    setQuery(value || "");
    setShowDrop(false);
  }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (
        dropRef.current &&
        !dropRef.current.contains(e.target) &&
        inputRef.current &&
        !inputRef.current.contains(e.target)
      ) {
        setShowDrop(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Empty query: show a friendly mix rather than the raw first 50.
      return items.slice(0, 50);
    }
    const starts = [];
    const contains = [];
    for (const it of items) {
      const l = it.label.toLowerCase();
      if (l.startsWith(q)) starts.push(it);
      else if (l.includes(q)) contains.push(it);
    }
    return [...starts, ...contains].slice(0, 50);
  }, [query, items]);

  const handleSelect = (item) => {
    setQuery(item.label);
    setShowDrop(false);
    onSelect(item);
  };

  const handleClear = () => {
    setQuery("");
    setShowDrop(false);
    onSelect(null);
    inputRef.current?.focus();
  };

  const exactMatch = filtered.length === 1 && filtered[0].label === query;

  return (
    <div className="search-wrap">
      <div className="search-box">
        <svg className="search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <line x1="12.5" y1="12.5" x2="17" y2="17" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onSelect(null);
            setShowDrop(true);
          }}
          onFocus={() => setShowDrop(true)}
          placeholder={placeholder}
          className="search-input"
        />
        {query && (
          <button className="clear-btn" onClick={handleClear} aria-label="Clear search">
            &times;
          </button>
        )}
      </div>

      {showDrop && !exactMatch && filtered.length > 0 && (
        <div ref={dropRef} className="dropdown">
          {filtered.map((item, i) => (
            <button
              key={`${item.type}-${item.label}-${i}`}
              type="button"
              onClick={() => handleSelect(item)}
              className="dropdown-item"
            >
              <span className="dropdown-label">{item.label}</span>
              <span className={`dropdown-badge badge-${item.type}`}>
                {item.type === "manager" ? "Manager" : "Fund"}
              </span>
            </button>
          ))}
          {filtered.length === 50 && (
            <div className="dropdown-hint">Keep typing to narrow results…</div>
          )}
        </div>
      )}
    </div>
  );
}
