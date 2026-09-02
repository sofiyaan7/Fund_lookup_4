import { useMemo } from "react";
import { formatDate, isActive, yearsBetween, tenureMonths, calcTenure } from "../utils";
import { inferAMC, uniqueAMCs, buildSourceLinks } from "../data/amc";
import { getManagerProfile } from "../data/managerProfiles";
import "./ManagerProfile.css";

const STAT_ICONS = {
  layers: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M10 3l7 3.5-7 3.5-7-3.5L10 3z" />
      <path d="M3 10.5L10 14l7-3.5" />
      <path d="M3 14l7 3.5 7-3.5" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="10" cy="10" r="7" />
      <path d="M7 10.2l2 2 4-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  exit: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="10" cy="10" r="7" />
      <path d="M7.5 7.5l5 5M12.5 7.5l-5 5" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.5V10l2.5 2" />
    </svg>
  ),
  briefcase: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="6.5" width="14" height="9.5" rx="2" />
      <path d="M7.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 12.5 5v1.5" />
    </svg>
  ),
  building: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="5" y="3.5" width="10" height="13" rx="1" />
      <path d="M8 7h1.5M10.5 7H12M8 10h1.5M10.5 10H12M8 13h1.5M10.5 13H12" strokeLinecap="round" />
    </svg>
  ),
};

// Small icons for the right-column accordions, keyed loosely by field label.
function accIcon(label) {
  const l = label.toLowerCase();
  if (l.includes("education"))
    return (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M10 4L2.5 8 10 12l7.5-4L10 4z" />
        <path d="M5.5 10v3.5c0 1 2 2 4.5 2s4.5-1 4.5-2V10" />
      </svg>
    );
  if (l.includes("previous") || l.includes("role") || l.includes("experience"))
    return (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="6.5" width="14" height="9.5" rx="2" />
        <path d="M7.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 12.5 5v1.5" />
      </svg>
    );
  if (l.includes("aum") || l.includes("track"))
    return (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M4 16V9M8 16V5M12 16v-6M16 16V7" />
      </svg>
    );
  if (l.includes("sector") || l.includes("focus"))
    return (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="10" r="7" />
        <circle cx="10" cy="10" r="3" />
      </svg>
    );
  if (l.includes("source"))
    return (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M8.5 11.5l3-3M7 13l-1.5 1.5a2.5 2.5 0 0 1-3.5-3.5L4.5 9M13 7l1.5-1.5a2.5 2.5 0 0 1 3.5 3.5L15.5 11" />
      </svg>
    );
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M6 3.5h6l3 3v10H6v-13z" strokeLinejoin="round" />
      <path d="M8.5 9h4M8.5 12h4" />
    </svg>
  );
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .slice(0, 2)
    .join("");
}

// Count of listed items inside a bio field value (split on semicolons).
function itemCount(value) {
  return value.split(";").filter((s) => s.trim()).length;
}

const UNCLASSIFIED = "Other / unclassified";

function Stat({ icon, value, label, small }) {
  return (
    <div className="card mp-stat">
      <span className="mp-stat-icon">{STAT_ICONS[icon]}</span>
      <span className={`mp-stat-val ${small ? "mp-stat-val--sm" : ""}`}>{value}</span>
      <span className="mp-stat-key">{label}</span>
    </div>
  );
}

export default function ManagerProfile({ name, records, onOpenScheme, children }) {
  const derived = useMemo(() => {
    if (!records || !records.length) return null;

    const schemes = [...new Set(records.map((r) => r.s))];
    const activeSchemes = new Set(
      records.filter((r) => isActive(r)).map((r) => r.s)
    );

    let earliest = null;
    let latest = null;
    let longest = null;
    records.forEach((r) => {
      if (!earliest || r.fd < earliest) earliest = r.fd;
      if (!latest || r.td > latest) latest = r.td;
      const months = tenureMonths(r.fd, r.td);
      if (!longest || months > longest.months)
        longest = { months, scheme: r.s, from: r.fd, to: r.td };
    });

    // Per-AMC employment spells (for the Experience card). Tenures at one AMC
    // are merged into continuous spells; a real gap between them breaks the
    // spell. A manager who left an AMC and later rejoined therefore shows as
    // two spells, each starting on an actual (re)join date — not the
    // earliest-ever date spanning the years away.
    const MERGE_GAP_MS = 45 * 24 * 60 * 60 * 1000; // month-end handoffs stay joined
    const byAmc = {};
    records.forEach((r) => {
      const amc = inferAMC(r.s);
      const key = amc ? amc.name : UNCLASSIFIED;
      (byAmc[key] ||= []).push(r);
    });

    const spells = [];
    Object.entries(byAmc).forEach(([amcName, recs]) => {
      [...recs]
        .sort((a, b) => a.fd.localeCompare(b.fd))
        .forEach((r) => {
          const cur = spells[spells.length - 1];
          const sameSpell =
            cur &&
            cur.name === amcName &&
            Date.parse(r.fd) <= Date.parse(cur.last) + MERGE_GAP_MS;
          if (sameSpell) {
            if (r.td > cur.last) cur.last = r.td;
            cur.schemes.add(r.s);
            // A spell is current if ANY tenure inside it is still open. That is
            // a per-record question (each fund has its own last reported month),
            // so it cannot be re-derived from the spell's end date alone.
            cur.active = cur.active || isActive(r);
          } else {
            spells.push({
              name: amcName,
              first: r.fd,
              last: r.td,
              schemes: new Set([r.s]),
              active: isActive(r),
              classified: amcName !== UNCLASSIFIED,
            });
          }
        });
    });

    const stints = spells
      .map((m) => ({
        ...m,
        schemes: [...m.schemes].sort(),
        count: m.schemes.size,
      }))
      .sort((a, b) => b.last.localeCompare(a.last) || b.first.localeCompare(a.first));

    const currentAMCs = [
      ...new Set(stints.filter((s) => s.active && s.classified).map((s) => s.name)),
    ];

    return {
      amcs: uniqueAMCs(schemes),
      total: schemes.length,
      active: activeSchemes.size,
      exited: schemes.length - activeSchemes.size,
      isCurrentlyActive: activeSchemes.size > 0,
      since: earliest,
      span: earliest ? yearsBetween(earliest, latest) : 0,
      longest,
      stints,
      currentAMCs,
    };
  }, [records]);

  const profile = useMemo(() => getManagerProfile(name), [name]);

  if (!derived) return null;

  const primaryAMC = derived.amcs[0] || null;
  const sourceLinks = buildSourceLinks(name, primaryAMC);
  const shortAMC = (n) => n.replace(" Mutual Fund", "");

  const roleField = profile?.fields.find((f) => f.label === "Current role");
  const sideFields = profile ? profile.fields : [];

  // Prefer a current, identifiable fund house; then the most recent
  // identifiable one; fall back to the unclassified bucket only if the manager
  // genuinely has nothing else. This previously took stints[0] unconditionally,
  // so one unrecognised scheme name could make the headline stat read "Other /
  // unclassified" while the About text right below correctly named the AMC.
  const lastClassified = derived.stints.find((s) => s.classified);
  const currentAMCLabel = derived.currentAMCs.length
    ? derived.currentAMCs.map(shortAMC).join(", ")
    : lastClassified
    ? shortAMC(lastClassified.name)
    : derived.stints[0]
    ? shortAMC(derived.stints[0].name)
    : "—";

  // A fully dataset-derived summary paragraph (no narrative claims).
  const amcNames = derived.amcs.map((a) => a.name);
  const aboutPara =
    `${name} appears in these records as a fund manager with ` +
    `${amcNames.length ? amcNames.join(" and ") : "unclassified schemes"}. ` +
    `The dataset shows ${derived.total} fund${derived.total > 1 ? "s" : ""} managed ` +
    `since ${formatDate(derived.since)} — about ${derived.span} years — with ` +
    `${derived.active} currently active. ` +
    (derived.longest
      ? `Longest single tenure on record: ${derived.longest.scheme} ` +
        `(${calcTenure(derived.longest.from, derived.longest.to)}).`
      : "");

  return (
    <>
      {/* Hero */}
      <div className="card mp-hero">
        <div className="mp-avatar" aria-hidden="true">
          {initials(name)}
        </div>
        <div className="mp-hero-body">
          <div className="mp-name-row">
            <h2 className="mp-name">{name}</h2>
            {profile && (
              <span className="mp-verified" title="Cited biography on file — every fact links to its source">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <circle cx="10" cy="10" r="7.5" />
                  <path d="M6.8 10.3l2.1 2.1 4.3-4.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            )}
          </div>
          <p className="mp-role">{roleField ? roleField.value : "Fund manager"}</p>
          <div className="mp-chips">
            {derived.currentAMCs.map((n) => (
              <span key={n} className="mp-chip">{n}</span>
            ))}
            <span className="mp-chip">~{derived.span} yrs in records</span>
            <span className={`mp-chip ${derived.isCurrentlyActive ? "mp-chip--on" : ""}`}>
              {derived.isCurrentlyActive ? "Active manager" : "Not currently active"}
            </span>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="mp-stats">
        <Stat icon="layers" value={derived.total} label="Funds managed" />
        <Stat icon="check" value={derived.active} label="Active funds" />
        <Stat icon="exit" value={derived.exited} label="Exited funds" />
        <Stat icon="clock" value={formatDate(derived.since)} label="Managing since" small />
        <Stat icon="briefcase" value={`${derived.span} years`} label="Experience (records)" small />
        <Stat icon="building" value={currentAMCLabel} label="Current AMC" small />
      </div>

      {/* About + bio accordions — two columns (only About shares the row with
          the accordions; everything below is full width, matching the ref). */}
      <div className="mp-grid">
        <div className="card mp-about">
          <div className="mp-card-head">
            <span className="mp-card-title">About</span>
            <span className="mp-card-note">Computed from this dataset</span>
          </div>
          <p className="mp-para">{aboutPara}</p>
          <div className="mp-facts">
            <div className="mp-fact">
              <span className="mp-fact-key">Asset manager</span>
              <span className="mp-fact-val">
                {amcNames.length ? amcNames.join(", ") : "—"}
              </span>
            </div>
            <div className="mp-fact">
              <span className="mp-fact-key">Managing since</span>
              <span className="mp-fact-val">
                {formatDate(derived.since)} · ~{derived.span}y
              </span>
            </div>
            <div className="mp-fact">
              <span className="mp-fact-key">Funds</span>
              <span className="mp-fact-val">
                {derived.total} total · {derived.active} active · {derived.exited} exited
              </span>
            </div>
            <div className="mp-fact">
              <span className="mp-fact-key">Longest tenure</span>
              <span className="mp-fact-val">
                {derived.longest
                  ? `${derived.longest.scheme} · ${calcTenure(derived.longest.from, derived.longest.to)}`
                  : "—"}
              </span>
            </div>
          </div>
          {!profile && (
            <p className="mp-empty">
              No verified biography on file yet — we don’t show unsourced bios.
              Open “Sources &amp; verification” to read this manager’s profile on
              an authoritative site.
            </p>
          )}
        </div>

        <div className="mp-side">
          {sideFields.map((f, i) => (
            <details key={i} className="card mp-acc">
              <summary className="mp-acc-head">
                <span className="mp-acc-ico">{accIcon(f.label)}</span>
                <span className="mp-acc-label">{f.label}</span>
                {itemCount(f.value) > 1 && (
                  <span className="mp-acc-count">{itemCount(f.value)}</span>
                )}
                <span className="mp-acc-caret">{"›"}</span>
              </summary>
              <div className="mp-acc-body">
                {f.value}
                <a
                  className="mp-cite"
                  href={f.src}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Source: ${f.src}`}
                  aria-label="View source"
                >
                  {"↗"}
                </a>
              </div>
            </details>
          ))}
          <details className="card mp-acc">
            <summary className="mp-acc-head">
              <span className="mp-acc-ico">{accIcon("sources")}</span>
              <span className="mp-acc-label">Sources &amp; verification</span>
              <span className="mp-acc-caret">{"›"}</span>
            </summary>
            <div className="mp-acc-body">
              <div className="mp-sources">
                {sourceLinks.map((s, i) => (
                  <a
                    key={i}
                    className="mp-source-link"
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {s.label}
                    <span className="mp-source-arrow">{"↗"}</span>
                  </a>
                ))}
              </div>
              <p className="mp-disclaimer">
                Profile facts carry citations; dataset facts are derived from this
                app’s tenure data and may lag official disclosures. Always confirm
                against the AMC’s factsheet / Scheme Information Document.
              </p>
            </div>
          </details>
        </div>
      </div>

      {/* Experience — full width, per-AMC stints derived from the records */}
      <div className="card mp-exp">
        <div className="mp-card-head">
          <span className="mp-card-title">Experience</span>
          <span className="mp-card-note">Derived from this dataset</span>
        </div>
        <div className="mp-xp-list">
          {derived.stints.map((s) => (
            <details key={`${s.name}@${s.first}`} className={`mp-xp ${s.active ? "is-current" : ""}`} open={s.active}>
              <summary className="mp-xp-head">
                <span className="mp-xp-avatar">{s.name.slice(0, 2).toUpperCase()}</span>
                <span className="mp-xp-main">
                  <span className="mp-xp-role">
                    Fund Manager
                    {s.active && <span className="mp-xp-now">current</span>}
                  </span>
                  <span className="mp-xp-co">{s.name}</span>
                  <span className="mp-xp-meta">
                    {formatDate(s.first)} → {s.active ? "Present" : formatDate(s.last)} ·{" "}
                    {s.count} fund{s.count > 1 ? "s" : ""}
                  </span>
                </span>
                <span className="mp-acc-caret">{"›"}</span>
              </summary>
              <div className="mp-xp-body">
                <span className="mp-xp-label">Funds managed (per records)</span>
                <div className="mp-xp-chips">
                  {s.schemes.map((sc) => (
                    <button
                      key={sc}
                      type="button"
                      className="mp-fund-chip"
                      onClick={() => onOpenScheme?.(sc)}
                      title={`Open ${sc}`}
                    >
                      {sc}
                    </button>
                  ))}
                </div>
              </div>
            </details>
          ))}
        </div>
        {profile?.fields.some((f) => f.label === "Previously") && (
          <p className="mp-xp-prev">
            <span className="mp-fact-key">Previously (per bio)</span>{" "}
            {profile.fields.find((f) => f.label === "Previously").value}
            <a
              className="mp-cite"
              href={profile.fields.find((f) => f.label === "Previously").src}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View source"
            >
              {"↗"}
            </a>
          </p>
        )}
      </div>

      {/* Career journey, fund tables, portfolio — full width */}
      {children}
    </>
  );
}
