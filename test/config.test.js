// Unit tests for the shared config / stale-threshold resolution
// (src/lib/config.js). Run: npm test (node --test, no extra dependencies)
//
// This is the regression suite for the v3.2.0 bug (found during the
// demo-video capture, 2026-11-19): Rovo + the review draft used a hardcoded
// 3-day threshold and ignored the saved "Stale after (days)" setting, while
// the dashboard respected it. The storage reader is injected, so no test
// here touches real Forge storage.

import test from "node:test";
import assert from "node:assert/strict";

import { CONFIG_KEY, DEFAULT_CONFIG, getSavedStaleDays, resolveStaleDays } from "../src/lib/config.js";

// --- the shared key ---------------------------------------------------------

test("CONFIG_KEY is the key the dashboard saves under", () => {
  assert.equal(CONFIG_KEY, "scout-config");
  assert.deepEqual(DEFAULT_CONFIG, { projectKey: "", spaceKey: "", staleDays: 3 });
});

// --- getSavedStaleDays ------------------------------------------------------

test("getSavedStaleDays: saved setting of 1 day is used", async () => {
  const days = await getSavedStaleDays(3, async (key) => {
    assert.equal(key, CONFIG_KEY);
    return { projectKey: "DEMO", spaceKey: "TEAM", staleDays: 1 };
  });
  assert.equal(days, 1);
});

test("getSavedStaleDays: nothing saved falls back to the 3-day default", async () => {
  assert.equal(await getSavedStaleDays(3, async () => null), 3);
  assert.equal(await getSavedStaleDays(3, async () => undefined), 3);
  assert.equal(await getSavedStaleDays(3, async () => ({})), 3);
});

test("getSavedStaleDays: a non-numeric saved value falls back to the default", async () => {
  assert.equal(await getSavedStaleDays(3, async () => ({ staleDays: "soon" })), 3);
  assert.equal(await getSavedStaleDays(3, async () => ({ staleDays: null })), 3);
});

test("getSavedStaleDays: a storage error falls back to the default (never throws)", async () => {
  const days = await getSavedStaleDays(3, async () => {
    throw new Error("storage unavailable");
  });
  assert.equal(days, 3);
});

test("getSavedStaleDays: saved values are clamped to 1–90", async () => {
  assert.equal(await getSavedStaleDays(3, async () => ({ staleDays: 200 })), 90);
  assert.equal(await getSavedStaleDays(3, async () => ({ staleDays: 0 })), 1);
  assert.equal(await getSavedStaleDays(3, async () => ({ staleDays: 2.9 })), 2);
});

// --- resolveStaleDays -------------------------------------------------------

test("resolveStaleDays: an explicit value wins over the saved setting", async () => {
  let storageRead = false;
  const days = await resolveStaleDays(5, 3, async () => {
    storageRead = true;
    return { staleDays: 1 };
  });
  assert.equal(days, 5);
  assert.equal(storageRead, false);
});

test("resolveStaleDays: no explicit value reads the saved setting", async () => {
  assert.equal(await resolveStaleDays(undefined, 3, async () => ({ staleDays: 1 })), 1);
  assert.equal(await resolveStaleDays(null, 3, async () => ({ staleDays: 2 })), 2);
});

test("resolveStaleDays: no explicit value and nothing saved gives the default", async () => {
  assert.equal(await resolveStaleDays(undefined, 3, async () => null), 3);
});

test("resolveStaleDays: an explicit value is clamped to 1–90", async () => {
  assert.equal(await resolveStaleDays(0, 3, async () => null), 1);
  assert.equal(await resolveStaleDays(500, 3, async () => null), 90);
});
