import { useEffect, useState } from "react";
import "./Sidebar.css";

// Expanded is the default. Persisted like the theme, and applied as a
// data attribute on <html> so App.css can widen the main column to match.
// localStorage throws outright (not just returns null) when a browser blocks
// site data, so an unguarded read here took the entire app down with it.
function initialCollapsed() {
  try {
    return localStorage.getItem("sidebar.collapsed") === "true";
  } catch {
    return false;
  }
}

const NAV = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="6" height="6" rx="1.5" />
        <rect x="11" y="3" width="6" height="6" rx="1.5" />
        <rect x="3" y="11" width="6" height="6" rx="1.5" />
        <rect x="11" y="11" width="6" height="6" rx="1.5" />
      </svg>
    ),
  },
  {
    key: "managers",
    label: "Managers",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="7" r="3.2" />
        <path d="M4 17c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5" />
      </svg>
    ),
  },
  {
    key: "funds",
    label: "Funds",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M10 3a7 7 0 1 0 7 7h-7V3z" />
        <path d="M13 3.6A7 7 0 0 1 16.4 7H13V3.6z" />
      </svg>
    ),
  },
  {
    key: "companies",
    label: "Companies",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="5" y="3.5" width="10" height="13" rx="1" />
        <path d="M8 7h1.5M10.5 7H12M8 10h1.5M10.5 10H12M8 13h1.5M10.5 13H12" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function Sidebar({ current, onNav }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  useEffect(() => {
    document.documentElement.setAttribute("data-sidebar", collapsed ? "collapsed" : "expanded");
    try {
      localStorage.setItem("sidebar.collapsed", String(collapsed));
    } catch {
      /* preference just won't persist */
    }
  }, [collapsed]);

  return (
    <aside className="sidebar">
      <button
        type="button"
        className="sb-brand"
        onClick={() => onNav("dashboard")}
        title="Fund & Manager Lookup"
      >
        <span className="sb-logo">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 14l4.5-4.5 3 3L17 6" />
            <path d="M13 6h4v4" />
          </svg>
        </span>
        <span className="sb-name">Fund &amp; Manager Lookup</span>
      </button>

      <nav className="sb-nav" aria-label="Primary">
        {NAV.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`sb-item ${current === item.key ? "is-on" : ""}`}
            onClick={() => onNav(item.key)}
            title={item.label}
          >
            <span className="sb-icon">{item.icon}</span>
            <span className="sb-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <button
        type="button"
        className="sb-collapse"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar — more room for wide tables"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`sb-collapse-ico ${collapsed ? "is-collapsed" : ""}`}
        >
          <path d="M12.5 4.5L7 10l5.5 5.5" />
        </svg>
        <span className="sb-label">Collapse</span>
      </button>
    </aside>
  );
}
