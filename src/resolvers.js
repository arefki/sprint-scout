// Sprint Scout — UI Kit backend (resolver).
//
// The dashboard (jira:globalPage) and the issue panel (jira:issuePanel) call
// these functions through `invoke` from @forge/bridge. They share the same
// analysis pipeline as the Rovo actions (src/service.js), so the dashboard
// and the agent never disagree.
//
// Config (project key, Confluence space key, stale-days threshold) lives in
// Forge storage, one record per installation.
//
// NOTE (2026-11-17): this file uses the NAMED import `makeResolver` on
// purpose. @forge/resolver is a CommonJS package whose class is exposed only
// as `exports.default`; in this pure-ESM repo ("type": "module") the default
// import `import Resolver from "@forge/resolver"` resolves to the module
// namespace object in the deployed webpack bundle, so `new Resolver()`
// crashed every invocation with "out_namespaceObject is not a constructor".
// `makeResolver` constructs the Resolver inside the CJS module itself, so no
// ESM/CJS interop is involved. Do NOT switch this back to `new Resolver()`.

import { makeResolver } from "@forge/resolver";
import { kvs } from "@forge/kvs";

import { daysSince, isDoneStatus } from "./lib/util.js";
import { findBlocked } from "./lib/health.js";
import { analyseSprint, draftSprintReview, nudgeIssue } from "./service.js";
import { getIssue, personName } from "./jira.js";

const CONFIG_KEY = "scout-config";

const DEFAULT_CONFIG = { projectKey: "", spaceKey: "", staleDays: 3 };

export const handler = makeResolver({
  getConfig: async () => {
    const saved = await kvs.get(CONFIG_KEY);
    return { ...DEFAULT_CONFIG, ...(saved || {}) };
  },

  setConfig: async (req) => {
    const next = {
      projectKey: String(req.payload?.projectKey || "").trim().toUpperCase(),
      spaceKey: String(req.payload?.spaceKey || "").trim().toUpperCase(),
      staleDays: Number(req.payload?.staleDays) || DEFAULT_CONFIG.staleDays,
    };
    if (next.staleDays < 1 || next.staleDays > 90) next.staleDays = DEFAULT_CONFIG.staleDays;
    await kvs.set(CONFIG_KEY, next);
    return next;
  },

  getHealth: async (req) => {
    const projectKey = String(req.payload?.projectKey || "").trim().toUpperCase();
    if (!projectKey) return { error: "Set a project key first (for example PROJ)." };
    try {
      const a = await analyseSprint(projectKey, req.payload?.staleDays);
      return {
        projectKey,
        mode: a.mode,
        sprint: a.sprint,
        board: a.board,
        health: a.health,
        stale: a.stale.slice(0, 10),
        totalStale: a.stale.length,
        blocked: a.blocked.slice(0, 10),
        totalBlocked: a.blocked.length,
        workload: a.workload,
        notes: a.notes,
      };
    } catch (e) {
      return { error: `Could not read the sprint: ${String(e.message).slice(0, 200)}` };
    }
  },

  createReviewDraft: async (req) => {
    const projectKey = String(req.payload?.projectKey || "").trim().toUpperCase();
    const spaceKey = String(req.payload?.spaceKey || "").trim().toUpperCase();
    if (!projectKey) return { error: "Set a project key first." };
    if (!spaceKey) return { error: "Set a Confluence space key first." };
    try {
      const result = await draftSprintReview(projectKey, spaceKey, { title: req.payload?.title });
      return { ok: true, pageTitle: result.page.title, pageUrl: result.page.url, counts: result.counts };
    } catch (e) {
      return { error: `Could not create the review page: ${String(e.message).slice(0, 200)}` };
    }
  },

  // Insight for the issue panel: is THIS issue stale, blocked, or healthy?
  getIssueInsight: async (req) => {
    const issueKey = String(req.payload?.issueKey || "").trim().toUpperCase();
    if (!issueKey) return { error: "No work item in context." };
    try {
      const issue = await getIssue(issueKey);
      if (!issue) return { error: `${issueKey} does not exist or you cannot see it.` };
      const f = issue.fields || {};
      const idle = daysSince(f.updated);
      const done = isDoneStatus(f.status);
      const stale = !done && idle !== null && idle >= (Number(req.payload?.staleDays) || 3);
      const blocked = findBlocked([issue]);
      const commentCount = f.comment?.total ?? f.comment?.comments?.length ?? 0;
      return {
        key: issue.key,
        summary: f.summary || "",
        status: f.status?.name || null,
        done,
        assignee: f.assignee?.displayName || null,
        reporter: f.reporter?.displayName || null,
        updated: f.updated,
        daysSinceUpdate: idle,
        stale,
        blockedBy: blocked[0]?.blockedBy || [],
        commentCount,
      };
    } catch (e) {
      return { error: `Could not read ${issueKey}: ${String(e.message).slice(0, 200)}` };
    }
  },

  // Nudge this one issue's assignee from the panel.
  nudgeThisIssue: async (req) => {
    const issueKey = String(req.payload?.issueKey || "").trim().toUpperCase();
    if (!issueKey) return { error: "No work item in context." };
    try {
      const issue = await getIssue(issueKey);
      if (!issue) return { error: `${issueKey} does not exist or you cannot see it.` };
      const idle = daysSince(issue.fields?.updated) ?? 0;
      const result = await nudgeIssue(issueKey, idle);
      return result.nudged ? { ok: true, ...result } : { error: result.reason };
    } catch (e) {
      return { error: `Could not send the nudge: ${String(e.message).slice(0, 200)}` };
    }
  },

  whoAmI: async (req) => {
    const id = req.context?.accountId;
    if (!id) return { name: null };
    return { name: await personName(id) };
  },
});
