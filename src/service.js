// Shared sprint pipeline for Sprint Scout.
//
// Both the Rovo actions (src/index.js) and the UI Kit resolvers
// (src/resolvers.js) call into this module, so the agent and the dashboard
// always agree on what "stale", "blocked" and "healthy" mean.
//
// Every function answers { ...data, notes } — `notes` carries anything that
// might be partial (a source that could not be read, a cap that was hit), so
// the agent can say "this may be incomplete" instead of inventing an answer.

import { buildNudgeAdf, buildReviewHtml, computeHealth, findBlocked, findStale, workloadFromIssues } from "./lib/health.js";
import { resolveStaleDays } from "./lib/config.js";
import { clampInt } from "./lib/util.js";
import { addComment, getActiveSprint, getIssue, getOpenIssues, getSprintIssues } from "./jira.js";
import { createPage } from "./confluence.js";

export const DEFAULT_STALE_DAYS = 3;
export const DEFAULT_OVERLOAD_AT = 8;
export const MAX_NUDGE_ISSUES = 5;
// How many title variants createReviewPage tries before giving up: the base
// title, then " (2)" … " (5)". Confluence titles must be unique per space,
// and the default title is one-per-sprint-per-day, so a second draft on the
// same day would otherwise always fail (verified 2026-11-17: six identical
// 400 "already exists" failures in a row).
export const MAX_REVIEW_TITLE_ATTEMPTS = 5;

// Load the work to analyse: the active sprint's issues when there is one,
// otherwise all open work in the project. Returns
// { mode: "sprint" | "open-work", sprint, board, issues, notes }.
export async function loadSprintWork(projectKey) {
  const notes = [];
  let sprint = null;
  let board = null;
  let issues = [];
  try {
    const active = await getActiveSprint(projectKey);
    if (active) {
      sprint = active.sprint;
      board = active.board;
      issues = await getSprintIssues(sprint.id);
      return { mode: "sprint", sprint, board, issues, notes };
    }
  } catch (e) {
    // The Agile API can fail on projects without boards (e.g. team-managed
    // projects with no board, or missing Jira Software). Fall through to the
    // JQL fallback and say so in the notes.
    notes.push(`No active sprint could be read (${String(e.message).slice(0, 120)}); showing all open work instead.`);
  }
  notes.push("No active sprint — showing all open work in the project.");
  issues = await getOpenIssues(projectKey);
  return { mode: "open-work", sprint: null, board: null, issues, notes };
}

// Full analysis for one project: health + stale + blocked + workload.
// `staleDays` is the threshold: an explicit value wins, otherwise the saved
// "Stale after (days)" setting from Forge storage, otherwise the 3-day
// default (see src/lib/config.js — the v3.2.0 bug was that callers without an
// explicit value always got 3, even when the dashboard had 1 saved).
// `getConfigFn` is a test seam for the storage read.
export async function analyseSprint(projectKey, staleDays = undefined, overloadAt = DEFAULT_OVERLOAD_AT, getConfigFn) {
  const days = await resolveStaleDays(staleDays, DEFAULT_STALE_DAYS, getConfigFn);
  const work = await loadSprintWork(projectKey);
  const health = computeHealth(work.sprint, work.issues);
  const stale = findStale(work.issues, days);
  const blocked = findBlocked(work.issues);
  const workload = workloadFromIssues(work.issues, overloadAt);
  return {
    projectKey,
    mode: work.mode,
    sprint: work.sprint
      ? {
          id: work.sprint.id,
          name: work.sprint.name,
          state: work.sprint.state,
          startDate: work.sprint.startDate || null,
          endDate: work.sprint.endDate || null,
          goal: work.sprint.goal || null,
        }
      : null,
    board: work.board,
    health,
    staleDays: days,
    stale,
    blocked,
    workload,
    notes: work.notes,
  };
}

// The base title for a review page. A non-empty override (from the agent or
// the dashboard) wins; otherwise the generated "Sprint review — <sprint> —
// <UTC date>" title is used. Pure, so the title logic is unit-testable.
export function buildReviewTitle(sprintName, titleOverride, now = new Date()) {
  const override = typeof titleOverride === "string" ? titleOverride.trim() : "";
  if (override) return override;
  const today = now.toISOString().slice(0, 10);
  return `Sprint review — ${sprintName} — ${today}`;
}

// True only for Confluence's duplicate-title 400: createPage wraps the API
// error as "Could not create the Confluence page (400): {...\"A page with
// this title already exists...\". Any other failure (403, 500, network)
// must NOT be retried as a title collision.
export function isDuplicateTitleError(e) {
  const msg = String(e?.message || "");
  return /\(400\)/.test(msg) && /already exists/i.test(msg);
}

// Create the review page, retrying with a numbered suffix when the title is
// taken: "… — 2026-11-17", "… — 2026-11-17 (2)", "… — 2026-11-17 (3)" …,
// up to MAX_REVIEW_TITLE_ATTEMPTS attempts. Returns the created page.
// Throws the original error for non-duplicate failures, and a clear error
// naming the collision when every variant is taken. `createPageFn` defaults
// to the real Confluence call; tests inject a stub.
export async function createReviewPage(spaceKey, baseTitle, html, createPageFn = createPage) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_REVIEW_TITLE_ATTEMPTS; attempt += 1) {
    const title = attempt === 1 ? baseTitle : `${baseTitle} (${attempt})`;
    try {
      return await createPageFn(spaceKey, title, html);
    } catch (e) {
      lastError = e;
      if (!isDuplicateTitleError(e)) throw e;
      // Duplicate title: try the next numbered variant.
    }
  }
  throw new Error(
    `Could not create the review page: a page titled "${baseTitle}" already exists in space ${spaceKey} ` +
      `and all ${MAX_REVIEW_TITLE_ATTEMPTS} title variants were taken. ${String(lastError?.message || "").slice(0, 120)}`,
  );
}

// Build the review page body + title, then create it in Confluence.
// `options.title` overrides the generated title (from the Rovo action's
// `title` input or the dashboard). The stale threshold is resolved the same
// way as everywhere else — saved setting first, 3-day default otherwise — so
// the draft can never disagree with the dashboard (the v3.2.0 bug).
// `options.createPageFn` / `options.analyseFn` / `options.getConfigFn` are
// test seams — production callers leave them out.
export async function draftSprintReview(projectKey, spaceKey, options = {}) {
  const analyseFn = options.analyseFn || analyseSprint;
  const createPageFn = options.createPageFn || createPage;
  const days = await resolveStaleDays(options.staleDays, DEFAULT_STALE_DAYS, options.getConfigFn);
  const analysis = await analyseFn(projectKey, days);
  const sprintName = analysis.sprint?.name || `Open work in ${projectKey}`;
  const title = buildReviewTitle(sprintName, options.title);
  const html = buildReviewHtml({
    sprint: analysis.sprint,
    health: analysis.health,
    stale: analysis.stale,
    blocked: analysis.blocked,
    workload: analysis.workload,
    projectKey,
    generatedAt: new Date().toISOString(),
    staleDays: days,
  });
  const page = await createReviewPage(spaceKey, title, html, createPageFn);
  return {
    page,
    projectKey,
    sprint: analysis.sprint?.name || null,
    staleDays: days,
    counts: {
      total: analysis.health.total,
      done: analysis.health.done,
      stale: analysis.stale.length,
      blocked: analysis.blocked.length,
      overloaded: analysis.workload.overloaded.length,
    },
    notes: analysis.notes,
  };
}

// Post a nudge comment on one issue. Returns { key, nudged, reason } —
// unassigned issues cannot be nudged at anyone, so they are reported as
// skipped instead of commented on.
export async function nudgeIssue(issueKey, daysStale) {
  const issue = await getIssue(issueKey);
  if (!issue) return { key: issueKey, nudged: false, reason: "not found or not visible" };
  const f = issue.fields || {};
  const idle = daysStale ?? null;
  if (!f.assignee) return { key: issueKey, nudged: false, reason: "no assignee to nudge" };
  const adf = buildNudgeAdf({
    assigneeAccountId: f.assignee.accountId,
    assigneeName: f.assignee.displayName,
    issueKey,
    daysStale: idle ?? 0,
  });
  await addComment(issueKey, adf);
  return { key: issueKey, nudged: true, assignee: f.assignee.displayName };
}

// Nudge the stalest issues in a project, up to `maxIssues`. The threshold
// resolves like everywhere else (explicit value, else saved setting, else
// the 3-day default). `getConfigFn` is a test seam for the storage read.
export async function nudgeStaleIssues(projectKey, staleDays = undefined, maxIssues = MAX_NUDGE_ISSUES, getConfigFn) {
  const days = await resolveStaleDays(staleDays, DEFAULT_STALE_DAYS, getConfigFn);
  const max = clampInt(maxIssues, MAX_NUDGE_ISSUES, 1, 10);
  const analysis = await analyseSprint(projectKey, days);
  const targets = analysis.stale.slice(0, max);
  const results = [];
  for (const t of targets) {
    try {
      results.push(await nudgeIssue(t.key, t.daysStale));
    } catch (e) {
      results.push({ key: t.key, nudged: false, reason: String(e.message).slice(0, 160) });
    }
  }
  const nudged = results.filter((r) => r.nudged);
  const skipped = results.filter((r) => !r.nudged);
  return {
    projectKey,
    sprint: analysis.sprint?.name || null,
    staleDays: days,
    staleFound: analysis.stale.length,
    nudged,
    skipped,
    notes: analysis.notes,
  };
}
