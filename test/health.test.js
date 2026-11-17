// Unit tests for Sprint Scout's pure analysis logic (src/lib/*).
// Run: npm test   (node --test, no extra dependencies)

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildNudgeAdf,
  buildReviewHtml,
  computeHealth,
  findBlocked,
  findStale,
  flagOverload,
  workloadFromIssues,
} from "../src/lib/health.js";
import {
  daysSince,
  daysUntil,
  isDoneStatus,
  normaliseProjectKey,
  openWorkJql,
  projectKeyFromIssueKey,
  userAri,
  workItemAri,
} from "../src/lib/util.js";

const NOW = new Date("2026-11-17T12:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const CATEGORY_OF = { Done: "done", Closed: "done", Resolved: "done", "In Progress": "indeterminate", "To Do": "new" };

function issue(key, { status = "In Progress", updated = daysAgo(1), assignee = "Ana", links = [] } = {}) {
  return {
    key,
    self: `https://example.atlassian.net/rest/api/3/issue/10001`,
    fields: {
      summary: `Summary of ${key}`,
      status: { name: status, statusCategory: { key: CATEGORY_OF[status] || "indeterminate" } },
      updated,
      assignee: assignee ? { displayName: assignee, accountId: `acc-${assignee}` } : null,
      issuelinks: links,
    },
  };
}

// What a BLOCKED issue's link entry looks like: the blocking issue is the
// outward side, so Jira exposes it as `outwardIssue`.
const blockedLink = (key, status = "In Progress") => ({
  type: { inward: "is blocked by", outward: "blocks" },
  outwardIssue: { key, fields: { summary: `Blocker ${key}`, status: { name: status } } },
});

// What a BLOCKER issue's link entry looks like: the issue it blocks is the
// inward side, so Jira exposes it as `inwardIssue`. Must NOT count as
// "blocked by" — reading this side was the v3.0.0 inversion bug.
const blockingLink = (key, status = "In Progress") => ({
  type: { inward: "is blocked by", outward: "blocks" },
  inwardIssue: { key, fields: { summary: `Blocked ${key}`, status: { name: status } } },
});

// --- statuses & dates ------------------------------------------------------

test("isDoneStatus honours status category first, then name", () => {
  assert.equal(isDoneStatus({ name: "Finished", statusCategory: { key: "done" } }), true);
  assert.equal(isDoneStatus({ name: "Done" }), true);
  assert.equal(isDoneStatus({ name: "Closed" }), true);
  assert.equal(isDoneStatus({ name: "Resolved" }), true);
  assert.equal(isDoneStatus({ name: "In Progress" }), false);
  assert.equal(isDoneStatus({ name: "To Do", statusCategory: { key: "new" } }), false);
  assert.equal(isDoneStatus(null), false);
});

test("daysSince / daysUntil count whole days", () => {
  assert.equal(daysSince(daysAgo(3), NOW), 3);
  assert.equal(daysSince(daysAgo(0), NOW), 0);
  assert.equal(daysSince("not-a-date", NOW), null);
  assert.equal(daysUntil(new Date(NOW.getTime() + 2 * 86_400_000).toISOString(), NOW), 2);
  assert.equal(daysUntil(daysAgo(1), NOW), -1);
});

// --- stale -----------------------------------------------------------------

test("findStale flags open idle issues, stalest first, and skips done ones", () => {
  const issues = [
    issue("P-1", { updated: daysAgo(5) }),
    issue("P-2", { updated: daysAgo(1) }),
    issue("P-3", { updated: daysAgo(9), status: "Done" }),
    issue("P-4", { updated: daysAgo(4), assignee: null }),
  ];
  const stale = findStale(issues, 3, NOW);
  assert.deepEqual(
    stale.map((s) => s.key),
    ["P-1", "P-4"],
  );
  assert.equal(stale[0].daysStale, 5);
  assert.equal(stale[1].assignee, null);
});

test("findStale with a 1-day threshold catches yesterday's issues", () => {
  const stale = findStale([issue("P-1", { updated: daysAgo(1) })], 1, NOW);
  assert.equal(stale.length, 1);
});

// --- blocked ---------------------------------------------------------------

test("findBlocked reports open blockers and ignores done blockers", () => {
  const issues = [
    issue("P-1", { links: [blockedLink("P-9", "In Progress")] }),
    issue("P-2", { links: [blockedLink("P-8", "Done")] }),
    issue("P-3", { status: "Done", links: [blockedLink("P-7", "In Progress")] }),
  ];
  const blocked = findBlocked(issues);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].key, "P-1");
  assert.deepEqual(
    blocked[0].blockedBy.map((b) => b.key),
    ["P-9"],
  );
});

// Regression test for the v3.0.0 inversion bug: an issue that BLOCKS another
// one (its link entry carries `inwardIssue`) is not itself blocked. An issue
// that both blocks one issue and is blocked by another reports only the real
// blocker.
test("findBlocked never reports the blocking side as blocked", () => {
  const issues = [
    issue("P-1", { links: [blockingLink("P-9", "In Progress")] }),
    issue("P-2", { links: [blockingLink("P-8", "In Progress"), blockedLink("P-7", "In Progress")] }),
  ];
  const blocked = findBlocked(issues);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].key, "P-2");
  assert.deepEqual(
    blocked[0].blockedBy.map((b) => b.key),
    ["P-7"],
  );
});

// --- health ----------------------------------------------------------------

test("computeHealth counts, percentages and the risk signal", () => {
  const sprint = { startDate: daysAgo(7), endDate: new Date(NOW.getTime() + 7 * 86_400_000).toISOString() };
  const issues = [
    issue("P-1", { status: "Done" }),
    issue("P-2", { status: "Done" }),
    issue("P-3", { status: "In Progress" }),
    issue("P-4", { status: "To Do" }),
  ];
  const h = computeHealth(sprint, issues, NOW);
  assert.equal(h.total, 4);
  assert.equal(h.done, 2);
  assert.equal(h.inProgress, 1);
  assert.equal(h.todo, 1);
  assert.equal(h.donePct, 50);
  assert.equal(h.daysLeft, 7);
  assert.equal(h.daysTotal, 14);
  assert.equal(h.risk, "on-track");
});

test("computeHealth flags at-risk when progress lags elapsed time", () => {
  const sprint = { startDate: daysAgo(9), endDate: new Date(NOW.getTime() + 1 * 86_400_000).toISOString() };
  const issues = [issue("P-1", { status: "Done" }), ...Array.from({ length: 9 }, (_, i) => issue(`P-${i + 2}`))];
  const h = computeHealth(sprint, issues, NOW);
  assert.equal(h.donePct, 10);
  assert.equal(h.risk, "at-risk");
  assert.match(h.riskReason, /10% of work is done/);
});

test("computeHealth handles an empty sprint", () => {
  const h = computeHealth({ startDate: daysAgo(1), endDate: daysAgo(-6) }, [], NOW);
  assert.equal(h.total, 0);
  assert.equal(h.risk, "empty");
});

test("computeHealth works without sprint dates", () => {
  const h = computeHealth(null, [issue("P-1", { status: "Done" }), issue("P-2")], NOW);
  assert.equal(h.daysLeft, null);
  assert.equal(h.donePct, 50);
  assert.equal(h.risk, "on-track");
});

// --- workload --------------------------------------------------------------

test("workloadFromIssues counts open work per assignee and flags overload", () => {
  const issues = [
    ...Array.from({ length: 9 }, (_, i) => issue(`P-${i + 1}`, { assignee: "Ana" })),
    issue("P-10", { assignee: "Ben" }),
    issue("P-11", { assignee: null }),
    issue("P-12", { assignee: "Ana", status: "Done" }),
  ];
  const w = workloadFromIssues(issues, 8);
  assert.equal(w.members[0].name, "Ana");
  assert.equal(w.members[0].openCount, 9);
  assert.equal(w.members[0].overloaded, true);
  assert.equal(w.members[1].overloaded, false);
  assert.equal(w.unassignedOpen, 1);
  assert.equal(w.overloaded.length, 1);
});

test("flagOverload sorts by open count and flags the overloaded", () => {
  const { members, overloaded } = flagOverload(
    [
      { name: "Ana", openCount: 2 },
      { name: "Ben", openCount: 11 },
    ],
    8,
  );
  assert.equal(members[0].name, "Ben");
  assert.deepEqual(
    overloaded.map((m) => m.name),
    ["Ben"],
  );
});

// --- review page -----------------------------------------------------------

test("buildReviewHtml renders health, stale, blocked and hotspots", () => {
  const html = buildReviewHtml({
    sprint: { name: "Sprint 12" },
    health: { donePct: 60, done: 6, total: 10, inProgress: 2, todo: 2, daysLeft: 3, risk: "watch", riskReason: "a bit behind" },
    stale: [{ key: "P-1", summary: "Old thing", status: "In Progress", assignee: "Ana", daysStale: 5, webUrl: "https://x/browse/P-1" }],
    blocked: [{ key: "P-2", summary: "Stuck thing", assignee: "Ben", blockedBy: [{ key: "P-9", status: "In Progress" }] }],
    workload: { overloaded: [{ name: "Ana", openCount: 9, keys: ["P-1"] }], unassignedOpen: 1 },
    projectKey: "PROJ",
    generatedAt: NOW.toISOString(),
  });
  assert.match(html, /Sprint review — Sprint 12/);
  assert.match(html, /60% done/);
  assert.match(html, /P-1/);
  assert.match(html, /P-9/);
  assert.match(html, /Ana/);
  assert.match(html, /1 open item\(s\) have no assignee/);
  assert.match(html, /Discussion prompts/);
});

test("buildReviewHtml escapes user-controlled text", () => {
  const html = buildReviewHtml({
    sprint: { name: "<script>alert(1)</script>" },
    health: { donePct: 0, done: 0, total: 0, inProgress: 0, todo: 0, daysLeft: null, risk: "empty", riskReason: "none" },
    stale: [],
    blocked: [],
    workload: { overloaded: [], unassignedOpen: 0 },
    projectKey: "PROJ",
    generatedAt: NOW.toISOString(),
  });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});

// --- nudge ADF -------------------------------------------------------------

test("buildNudgeAdf mentions the assignee and names the issue", () => {
  const adf = buildNudgeAdf({ assigneeAccountId: "acc-1", assigneeName: "Ana", issueKey: "P-1", daysStale: 4 });
  assert.equal(adf.type, "doc");
  const paragraph = adf.content[0];
  assert.equal(paragraph.content[0].type, "mention");
  assert.equal(paragraph.content[0].attrs.id, "acc-1");
  assert.match(paragraph.content.at(-1).text, /P-1 hasn't been updated in 4 day\(s\)/);
});

test("buildNudgeAdf works without an account id", () => {
  const adf = buildNudgeAdf({ assigneeAccountId: null, assigneeName: "Ana", issueKey: "P-1", daysStale: 2 });
  assert.equal(adf.content[0].content[0].type, "text");
  assert.match(adf.content[0].content[0].text, /Ana/);
});

// --- utils -----------------------------------------------------------------

test("normaliseProjectKey validates Jira project keys", () => {
  assert.equal(normaliseProjectKey("proj"), "PROJ");
  assert.equal(normaliseProjectKey(" P1 "), "P1");
  assert.equal(normaliseProjectKey("1ABC"), null);
  assert.equal(normaliseProjectKey("A-B"), null);
  assert.equal(normaliseProjectKey(""), null);
  assert.equal(normaliseProjectKey(null), null);
});

test("projectKeyFromIssueKey extracts the project", () => {
  assert.equal(projectKeyFromIssueKey("PROJ-123"), "PROJ");
  assert.equal(projectKeyFromIssueKey("proj-7"), "PROJ");
  assert.equal(projectKeyFromIssueKey("PROJ"), null);
  assert.equal(projectKeyFromIssueKey("not a key"), null);
});

test("openWorkJql builds the fallback query", () => {
  assert.equal(openWorkJql("PROJ"), "project = PROJ AND statusCategory != Done ORDER BY updated ASC");
});

test("ARI builders shape Teamwork Graph ids", () => {
  assert.equal(userAri("abc123"), "ari:cloud:identity::user/abc123");
  assert.equal(workItemAri("cloud-1", "10001"), "ari:cloud:jira:cloud-1:issue/10001");
});
