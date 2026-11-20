// Shared Forge-storage config for Sprint Scout.
//
// One record per installation, key "scout-config":
//   { projectKey, spaceKey, staleDays }
// The dashboard saves it (resolvers.js setConfig); the Rovo actions read the
// stale-days threshold back through here, so the agent and the dashboard can
// never disagree on what "stale" means.
//
// This module exists because of the v3.2.0 bug (found during the demo-video
// capture, 2026-11-19): Rovo + the review draft used a hardcoded 3-day
// threshold and ignored the saved setting, while the dashboard respected it —
// with "Stale after (days)" saved as 1, the dashboard showed 10 stale issues
// and Rovo said "no stale issues". The threshold is now resolved in ONE place
// (resolveStaleDays) and every caller goes through it.

import { kvs } from "@forge/kvs";
import { clampInt } from "./util.js";

export const CONFIG_KEY = "scout-config";

export const DEFAULT_CONFIG = { projectKey: "", spaceKey: "", staleDays: 3 };

// Read the saved stale-days threshold from Forge storage. Falls back to
// `fallback` (3) when nothing is saved, the saved value is not a number, or
// storage cannot be read — a storage hiccup must never break an action.
// `getFn` is a test seam (production callers leave it out).
export async function getSavedStaleDays(fallback = 3, getFn = (key) => kvs.get(key)) {
  try {
    const saved = await getFn(CONFIG_KEY);
    const raw = saved?.staleDays;
    // Guard before Number(): Number(null) and Number("") are both 0, which
    // would clamp to 1 instead of falling back to the default.
    if (raw === undefined || raw === null || raw === "" || typeof raw === "boolean") return fallback;
    const days = Number(raw);
    if (!Number.isFinite(days)) return fallback;
    return clampInt(days, fallback, 1, 90);
  } catch {
    return fallback;
  }
}

// Resolve the effective threshold: an explicit value (the dashboard's
// setting passed through, or Rovo's `days` input) wins; otherwise the saved
// setting; otherwise the default. `getFn` is the same test seam.
export async function resolveStaleDays(explicit, fallback = 3, getFn) {
  if (explicit !== undefined && explicit !== null && explicit !== "") {
    return clampInt(explicit, fallback, 1, 90);
  }
  return getSavedStaleDays(fallback, getFn);
}
