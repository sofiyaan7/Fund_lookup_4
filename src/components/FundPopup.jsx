import { useEffect, useState } from "react";
import { loadDossier, formatCrore } from "../data/dossier";
import { inferAMC } from "../data/amc";
import SectorChart from "./SectorChart";
import "./FundPopup.css";

// Quick-view modal for a fund, openable from anywhere in the app by scheme
// name — it loads its own meta/composition from the cached dossier data.
// "Open full page" jumps to the full fund view.
export default function FundPopup({ scheme, onClose, onOpenFull }) {
  const [fund, setFund] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFund(null);
    setFailed(false);
    loadDossier()
      .then((d) => {
        if (!alive) return;
        const meta = d.meta[scheme] || {};
        setFund({
          scheme,
          cat: meta.cat || "—",
          aum: meta.aum ?? null,
          comp: d.composition[scheme] || null,
          amc: inferAMC(scheme),
        });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [scheme]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fp-overlay" onClick={onClose} role="presentation">
      <div
        className="fp-modal card"
        role="dialog"
        aria-modal="true"
        aria-label={`${scheme} quick view`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fp-head">
          <div className="fp-head-main">
            <h3 className="fp-name">{scheme}</h3>
            {fund && (
              <div className="fp-chips">
                {fund.amc && <span className="fp-chip">{fund.amc.name}</span>}
                <span className="fp-chip">{fund.cat}</span>
                {fund.aum != null && <span className="fp-chip">{formatCrore(fund.aum)}</span>}
                {fund.comp && <span className="fp-chip">{fund.comp.n} holdings</span>}
              </div>
            )}
          </div>
          <button type="button" className="fp-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="fp-body">
          {failed && <p className="fp-note">Couldn’t load fund data.</p>}
          {!fund && !failed && <p className="fp-note">Loading fund data…</p>}

          {fund && fund.comp ? (
            <>
              <div className="fp-block">
                <SectorChart sectors={fund.comp.sectors} maxSlices={7} />
              </div>

              {fund.comp.top?.length > 0 && (
                <div className="fp-block">
                  <span className="fp-label">Top holdings</span>
                  <div className="fp-holds">
                    {fund.comp.top.slice(0, 8).map(([name, v]) => (
                      <div key={name} className="fp-hold">
                        <span className="fp-hold-name">{name}</span>
                        <span className="fp-hold-val">{v}%</span>
                      </div>
                    ))}
                  </div>
                  {fund.comp.top.length > 8 && (
                    <p className="fp-more">
                      +{fund.comp.top.length - 8} more holdings on the full page
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            fund && (
              <p className="fp-note">
                No disclosed portfolio for this scheme in the May 2026 dump — open the
                full page for manager history and NAV data.
              </p>
            )
          )}
        </div>

        <div className="fp-foot">
          <span className="fp-note">Disclosed holdings · May 2026</span>
          <button type="button" className="fp-open" onClick={onOpenFull}>
            Open full page <span className="fp-open-arrow">{"↗"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
