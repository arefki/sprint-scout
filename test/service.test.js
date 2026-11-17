// Unit tests for the sprint-review draft pipeline (src/service.js).
// Run: npm test   (node --test, no extra dependencies)
//
// draftSprintReview's external calls are injected (options.analyseFn /
// options.createPageFn), so no test here touches real Jira or Confluence.

import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_REVIEW_TITLE_ATTEMPTS,
  buildReviewTitle,
  createReviewPage,
  draftSprintReview,
  isDuplicateTitleError,
} from "../src/service.js";

// What Confluence's v2 API answers when the title is taken, as wrapped by
// src/confluence.js — the exact shape seen in forge logs 2026-11-17.
const duplicateError = () =>
  new Error(
    'Could not create the Confluence page (400): {"errors":[{"status":400,"code":"BAD_REQUEST",' +
      '"title":"A page with this title already exists: A page already exists with the same TITLE in this space"}]}',
  );

const fakeAnalysis = () => ({
  sprint: { name: "Sprint 12" },
  health: { donePct: 50, done: 6, total: 12, inProgress: 4, todo: 2, daysLeft: 14, risk: "on-track", riskReason: "on pace" },
  stale: [],
  blocked: [],
  workload: { overloaded: [], unassignedOpen: 0 },
  notes: [],
});

// --- title building ---------------------------------------------------------

test("buildReviewTitle uses the default sprint + date format", () => {
  assert.equal(
    buildReviewTitle("Sprint 12", undefined, new Date("2026-11-17T20:37:00Z")),
    "Sprint review — Sprint 12 — 2026-11-17",
  );
});

test("buildReviewTitle honours a title override (trimmed)", () => {
  assert.equal(buildReviewTitle("Sprint 12", "  Team sprint health snapshot  "), "Team sprint health snapshot");
});

test("buildReviewTitle falls back to the default for an empty override", () => {
  assert.equal(
    buildReviewTitle("Sprint 12", "   ", new Date("2026-11-17T20:37:00Z")),
    "Sprint review — Sprint 12 — 2026-11-17",
  );
  assert.equal(
    buildReviewTitle("Sprint 12", null, new Date("2026-11-17T20:37:00Z")),
    "Sprint review — Sprint 12 — 2026-11-17",
  );
});

// --- duplicate detection ----------------------------------------------------

test("isDuplicateTitleError matches only Confluence's duplicate-title 400", () => {
  assert.equal(isDuplicateTitleError(duplicateError()), true);
  assert.equal(isDuplicateTitleError(new Error("Could not create the Confluence page (403): Forbidden")), false);
  assert.equal(isDuplicateTitleError(new Error("Could not create the Confluence page (500): boom")), false);
  assert.equal(isDuplicateTitleError(new Error("A page with this title already exists")), false);
  assert.equal(isDuplicateTitleError(new Error("network down")), false);
  assert.equal(isDuplicateTitleError(null), false);
});

// --- retry loop -------------------------------------------------------------

test("createReviewPage first-attempt success keeps the plain title", async () => {
  const calls = [];
  const stub = async (spaceKey, title) => {
    calls.push(title);
    return { id: "1", title, url: "https://x/wiki/1" };
  };
  const page = await createReviewPage("TEAM", "Sprint review — Sprint 12 — 2026-11-17", "<p>x</p>", stub);
  assert.equal(page.title, "Sprint review — Sprint 12 — 2026-11-17");
  assert.deepEqual(calls, ["Sprint review — Sprint 12 — 2026-11-17"]);
});

test("createReviewPage retries a duplicate title with a (2) suffix", async () => {
  const calls = [];
  const stub = async (spaceKey, title) => {
    calls.push(title);
    if (calls.length === 1) throw duplicateError();
    return { id: "2", title, url: "https://x/wiki/2" };
  };
  const page = await createReviewPage("TEAM", "Sprint review — Sprint 12 — 2026-11-17", "<p>x</p>", stub);
  assert.equal(page.title, "Sprint review — Sprint 12 — 2026-11-17 (2)");
  assert.deepEqual(calls, ["Sprint review — Sprint 12 — 2026-11-17", "Sprint review — Sprint 12 — 2026-11-17 (2)"]);
});

test("createReviewPage escalates the suffix and throws a clear error after 5 collisions", async () => {
  const calls = [];
  const stub = async (spaceKey, title) => {
    calls.push(title);
    throw duplicateError();
  };
  await assert.rejects(
    () => createReviewPage("TEAM", "Sprint review — Sprint 12 — 2026-11-17", "<p>x</p>", stub),
    /already exists in space TEAM/,
  );
  assert.equal(calls.length, MAX_REVIEW_TITLE_ATTEMPTS);
  assert.deepEqual(calls, [
    "Sprint review — Sprint 12 — 2026-11-17",
    "Sprint review — Sprint 12 — 2026-11-17 (2)",
    "Sprint review — Sprint 12 — 2026-11-17 (3)",
    "Sprint review — Sprint 12 — 2026-11-17 (4)",
    "Sprint review — Sprint 12 — 2026-11-17 (5)",
  ]);
});

test("createReviewPage does NOT retry a non-duplicate error", async () => {
  const calls = [];
  const forbidden = new Error("Could not create the Confluence page (403): Forbidden");
  const stub = async (spaceKey, title) => {
    calls.push(title);
    throw forbidden;
  };
  await assert.rejects(() => createReviewPage("TEAM", "Sprint review — Sprint 12 — 2026-11-17", "<p>x</p>", stub), (e) => {
    assert.equal(e, forbidden);
    return true;
  });
  assert.equal(calls.length, 1);
});

// --- draftSprintReview wiring -----------------------------------------------

test("draftSprintReview uses the default title and returns page + counts", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const calls = [];
  const stub = async (spaceKey, title) => {
    calls.push(title);
    return { id: "9", title, url: "https://x/wiki/9" };
  };
  const result = await draftSprintReview("DEMO", "TEAM", {
    analyseFn: async () => fakeAnalysis(),
    createPageFn: stub,
  });
  assert.equal(result.page.title, `Sprint review — Sprint 12 — ${today}`);
  assert.equal(result.sprint, "Sprint 12");
  assert.deepEqual(result.counts, { total: 12, done: 6, stale: 0, blocked: 0, overloaded: 0 });
  assert.equal(calls.length, 1);
});

test("draftSprintReview passes a title override through (the v3.1.0 bug: it was ignored)", async () => {
  const calls = [];
  const stub = async (spaceKey, title) => {
    calls.push(title);
    return { id: "9", title, url: "https://x/wiki/9" };
  };
  const result = await draftSprintReview("DEMO", "TEAM", {
    title: "Team sprint health snapshot — 17 Nov 2026",
    analyseFn: async () => fakeAnalysis(),
    createPageFn: stub,
  });
  assert.equal(result.page.title, "Team sprint health snapshot — 17 Nov 2026");
  assert.deepEqual(calls, ["Team sprint health snapshot — 17 Nov 2026"]);
});

test("draftSprintReview retries a duplicate default title with a suffix", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const calls = [];
  const stub = async (spaceKey, title) => {
    calls.push(title);
    if (calls.length === 1) throw duplicateError();
    return { id: "9", title, url: "https://x/wiki/9" };
  };
  const result = await draftSprintReview("DEMO", "TEAM", {
    analyseFn: async () => fakeAnalysis(),
    createPageFn: stub,
  });
  assert.equal(result.page.title, `Sprint review — Sprint 12 — ${today} (2)`);
  assert.equal(calls.length, 2);
});
