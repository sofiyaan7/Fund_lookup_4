// User-editable AUM overrides.
//
// The disclosed AUM figures come from the data dump (point-in-time, May 2026).
// This store lets a user correct or add the *current* AUM for a scheme without
// touching the source data. Overrides are kept in localStorage and are clearly
// flagged as user-entered in the UI — they never masquerade as sourced figures,
// and they only affect the headline/current AUM, not the historical AUM series.

import { useSyncExternalStore } from "react";

const KEY = "aum.overrides.v1"; // { [scheme]: { aum: number, at: number } }
const EVENT = "aum-overrides-change";

const listeners = new Set();

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function writeAll(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* storage full/blocked — overrides are best-effort */
  }
  // Notify same-tab subscribers (the native 'storage' event only fires in
  // *other* tabs, so we drive our own).
  listeners.forEach((l) => l());
  try {
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* non-browser env */
  }
}

// Read the override entry ({ aum, at }) for a scheme, or undefined.
export function getOverride(scheme) {
  return readAll()[scheme];
}

// Set (or replace) a scheme's AUM override. `aum` is ₹ crore.
export function setOverride(scheme, aum) {
  const n = Number(aum);
  if (!Number.isFinite(n) || n < 0) return;
  const map = readAll();
  map[scheme] = { aum: Math.round(n * 100) / 100, at: Date.now() };
  writeAll(map);
}

// Remove a scheme's override (revert to the sourced figure).
export function clearOverride(scheme) {
  const map = readAll();
  if (scheme in map) {
    delete map[scheme];
    writeAll(map);
  }
}

// Effective AUM for display: the override if present, otherwise the base
// (sourced) value. Returns null when neither is available.
export function effectiveAum(scheme, base) {
  const o = readAll()[scheme];
  if (o && Number.isFinite(o.aum)) return o.aum;
  return base ?? null;
}

// True when the scheme's displayed AUM comes from a user override.
export function isOverridden(scheme) {
  return !!readAll()[scheme];
}

/* ── React binding ─────────────────────────────────────────────────────── */

function subscribe(cb) {
  listeners.add(cb);
  const onStorage = (e) => {
    if (!e || e.key === null || e.key === KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

// A snapshot that changes identity whenever overrides change, so components
// that read effectiveAum() re-render. The value is the serialized map string.
function snapshot() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

// Subscribe a component to override changes. The returned value is opaque; use
// it only as a dependency / to force reads of effectiveAum() to refresh.
export function useAumOverrides() {
  return useSyncExternalStore(subscribe, snapshot, () => "");
}
