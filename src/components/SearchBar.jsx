import { useState, useRef, useEffect, useMemo, useId } from "react";
import "./SearchBar.css";

// Unified search across both managers and funds. `items` is an array of
// { label, type } where type is "manager" | "scheme". Selecting a row hands the
// whole item back so the app knows which kind of entity was chosen.
//
// Fully keyboard-operable: ↑/↓ move the highlight, Enter opens it, Escape
// closes the list. It used to be mouse-only — arrow keys and Enter did nothing
// even with a single result showing — and the list carried no ARIA roles, so
// screen readers saw a plain text box with 50 loose buttons after it.
export default function SearchBar({ items, placeholder, onSelect, value }) {
  const [query, setQuery] = useState(value || "");
  const [showDrop, setShowDrop] = useState(false);
  const [cursor, setCursor] = useState(-1); // index into `filtered`
  const inputRef = useRef(null);
  const dropRef = useRef(null);
  const listId = useId();

  // Keep the input in sync when the selection changes from outside
  // (cross-link navigation or breadcrumb jumps).
  useEffect(() => {
    setQuery(value || "");
    setShowDrop(false);
    setCursor(-1);
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
    if (!q) return items.slice(0, 50);
    const starts = [];
    const contains = [];
    for (const it of items) {
      const l = it.label.toLowerCase();
      if (l.startsWith(q)) starts.push(it);
      else if (l.includes(q)) contains.push(it);
    }
    return [...starts, ...contains].slice(0, 50);
  }, [query, items]);

  const exactMatch = filtered.length === 1 && filtered[0].label === query;
  const open = showDrop && !exactMatch && filtered.length > 0;

  // Keep the highlighted row scrolled into view as the cursor moves.
  useEffect(() => {
    if (!open || cursor < 0 || !dropRef.current) return;
    dropRef.current
      .querySelector(`[data-idx="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  const handleSelect = (item) => {
    setQuery(item.label);
    setShowDrop(false);
    setCursor(-1);
    onSelect(item);
  };

  const handleClear = () => {
    setQuery("");
    setShowDrop(false);
    setCursor(-1);
    onSelect(null);
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      setShowDrop(false);
      setCursor(-1);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!showDrop) {
        setShowDrop(true);
        setCursor(0);
        return;
      }
      if (!filtered.length) return;
      const dir = e.key === "ArrowDown" ? 1 : -1;
      setCursor((c) => {
        const next = c + dir;
        if (next < 0) return filtered.length - 1;
        if (next >= filtered.length) return 0;
        return next;
      });
      return;
    }
    if (e.key === "Enter") {
      // Enter with nothing highlighted takes the top match — the common case
      // of "type a few letters, hit Enter".
      const pick = cursor >= 0 ? filtered[cursor] : filtered[0];
      if (open && pick) {
        e.preventDefault();
        handleSelect(pick);
      }
      return;
    }
    if (e.key === "Home" && showDrop) {
      e.preventDefault();
      setCursor(0);
    }
    if (e.key === "End" && showDrop) {
      e.preventDefault();
      setCursor(filtered.length - 1);
    }
  };

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
            setCursor(-1);
          }}
          onFocus={() => setShowDrop(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="search-input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && cursor >= 0 ? `${listId}-opt-${cursor}` : undefined
          }
        />
        {query && (
          <button
            type="button"
            className="clear-btn"
            onClick={handleClear}
            aria-label="Clear search"
          >
            &times;
          </button>
        )}
      </div>

      {open && (
        <div ref={dropRef} className="dropdown" id={listId} role="listbox">
          {filtered.map((item, i) => (
            <button
              key={`${item.type}-${item.label}-${i}`}
              id={`${listId}-opt-${i}`}
              data-idx={i}
              type="button"
              role="option"
              aria-selected={i === cursor}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setCursor(i)}
              className={`dropdown-item ${i === cursor ? "dropdown-item--on" : ""}`}
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
