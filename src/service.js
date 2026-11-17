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
import { clampInt } from "./lib/util.js";
import { addComment, getActiveSprint, getIssue, getOpenIssues, getSprintIssues } from "./jira.js";
import { createPage } from "./confluence.js";

export const DEFAULT_STALE_DAYS = 3;
export const DEFAULT_OVERLOAD_AT = 8;
export const MAX_NUDGE_ISSUES = 5;

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
export async function analyseSprint(projectKey, staleDays = DEFAULT_STALE_DAYS, overloadAt = DEFAULT_OVERLOAD_AT) {
  const days = clampInt(staleDays, DEFAULT_STALE_DAYS, 1, 90);
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
    stale,
    blocked,
    workload,
    notes: work.notes,
  };
}

// Build the review page body + title, then create it in Confluence.
export async function draftSprintReview(projectKey, spaceKey) {
  const analysis = await analyseSprint(projectKey);
  const sprintName = analysis.sprint?.name || `Open work in ${projectKey}`;
  const today = new Date().toISOString().slice(0, 10);
  const title = `Sprint review — ${sprintName} — ${today}`;
  const html = buildReviewHtml({
    sprint: analysis.sprint,
    health: analysis.health,
    stale: analysis.stale,
    blocked: analysis.blocked,
    workload: analysis.workload,
    projectKey,
    generatedAt: new Date().toISOString(),
  });
  const page = await createPage(spaceKey, title, html);
  return {
    page,
    projectKey,
    sprint: analysis.sprint?.name || null,
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

// Nudge the stalest issues in a project, up to `maxIssues`.
export async function nudgeStaleIssues(projectKey, staleDays = DEFAULT_STALE_DAYS, maxIssues = MAX_NUDGE_ISSUES) {
  const days = clampInt(staleDays, DEFAULT_STALE_DAYS, 1, 90);
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
    staleFound: analysis.stale.length,
    nudged,
    skipped,
    notes: analysis.notes,
  };
}
