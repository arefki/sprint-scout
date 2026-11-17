// Sprint analysis for Sprint Scout — pure functions over Jira REST payloads.
// No Forge imports: fully unit-testable (see test/health.test.js).

import { daysSince, daysUntil, escapeHtml, isDoneStatus, isInProgressStatus } from "./util.js";

// An issue is "stale" when it is not done and nobody has touched it for at
// least `days` days. `updated` moves on comments, edits and transitions, so
// it is a good proxy for "last activity".
export function findStale(issues, days, now = new Date()) {
  const stale = [];
  for (const issue of issues) {
    const f = issue.fields || {};
    if (isDoneStatus(f.status)) continue;
    const idle = daysSince(f.updated, now);
    if (idle === null || idle < days) continue;
    stale.push({
      key: issue.key,
      summary: f.summary || "",
      status: f.status?.name || null,
      assignee: f.assignee?.displayName || null,
      assigneeAccountId: f.assignee?.accountId || null,
      daysStale: idle,
      updated: f.updated,
      webUrl: issue.self ? issue.self.replace(/\/rest\/api\/3\/issue\/\d+$/, `/browse/${issue.key}`) : null,
    });
  }
  // Stalest first — the ones that need attention most.
  stale.sort((a, b) => b.daysStale - a.daysStale);
  return stale;
}

// An issue is "blocked" when it has an inward "is blocked by" link. Jira
// link types are named from the outward side ("Blocks"), so the inward side
// of a Blocks link reads "is blocked by" — and on the blocked issue's own
// link entry, Jira exposes the blocking issue as `outwardIssue`.
// (`inwardIssue` appears on the BLOCKER's entry, i.e. the issue it blocks;
// reading that would report the blocker as blocked. Fixed in v3.0.1.)
export function findBlocked(issues) {
  const blocked = [];
  for (const issue of issues) {
    const f = issue.fields || {};
    if (isDoneStatus(f.status)) continue;
    const blockers = [];
    for (const link of f.issuelinks || []) {
      if (link.type?.inward === "is blocked by" && link.outwardIssue) {
        blockers.push({
          key: link.outwardIssue.key,
          summary: link.outwardIssue.fields?.summary || "",
          status: link.outwardIssue.fields?.status?.name || null,
          done: isDoneStatus(link.outwardIssue.fields?.status),
        });
      }
    }
    // A blocker that is already Done no longer blocks anything.
    const openBlockers = blockers.filter((b) => !b.done);
    if (openBlockers.length === 0) continue;
    blocked.push({
      key: issue.key,
      summary: f.summary || "",
      status: f.status?.name || null,
      assignee: f.assignee?.displayName || null,
      blockedBy: openBlockers,
    });
  }
  return blocked;
}

// Overall sprint health from the sprint metadata + its issues.
export function computeHealth(sprint, issues, now = new Date()) {
  const total = issues.length;
  let done = 0;
  let inProgress = 0;
  for (const issue of issues) {
    const status = issue.fields?.status;
    if (isDoneStatus(status)) done += 1;
    else if (isInProgressStatus(status)) inProgress += 1;
  }
  const todo = total - done - inProgress;
  const donePct = total === 0 ? 100 : Math.round((done / total) * 100);
  const daysLeft = sprint?.endDate ? daysUntil(sprint.endDate, now) : null;
  const daysTotal =
    sprint?.startDate && sprint?.endDate
      ? Math.max(1, Math.round((Date.parse(sprint.endDate) - Date.parse(sprint.startDate)) / 86_400_000))
      : null;
  const daysElapsed =
    sprint?.startDate && daysTotal !== null
      ? Math.min(daysTotal, Math.max(0, daysTotal - (daysLeft ?? 0)))
      : null;

  // A simple, explainable risk signal: behind schedule if the share of the
  // sprint elapsed is well ahead of the share of work done.
  let risk = "on-track";
  let riskReason = "Progress matches the time elapsed in the sprint.";
  if (total > 0 && daysTotal !== null && daysElapsed !== null && daysElapsed > 0) {
    const timePct = Math.round((daysElapsed / daysTotal) * 100);
    if (donePct < timePct - 25) {
      risk = "at-risk";
      riskReason = `${donePct}% of work is done but ${timePct}% of the sprint has elapsed.`;
    } else if (donePct < timePct - 10) {
      risk = "watch";
      riskReason = `${donePct}% of work is done against ${timePct}% of the sprint elapsed.`;
    }
  }
  if (total === 0) {
    risk = "empty";
    riskReason = "The sprint has no work items in it.";
  }

  return {
    total,
    done,
    inProgress,
    todo,
    donePct,
    daysLeft,
    daysTotal,
    daysElapsed,
    risk,
    riskReason,
  };
}

// Workload from a flat list of open issues: how much open work each assignee
// carries. Anyone over `overloadAt` open items is flagged overloaded.
export function workloadFromIssues(issues, overloadAt = 8) {
  const byAssignee = new Map();
  let unassigned = 0;
  for (const issue of issues) {
    const f = issue.fields || {};
    if (isDoneStatus(f.status)) continue;
    const name = f.assignee?.displayName;
    if (!name) {
      unassigned += 1;
      continue;
    }
    const row = byAssignee.get(name) || {
      name,
      accountId: f.assignee.accountId || null,
      openCount: 0,
      keys: [],
    };
    row.openCount += 1;
    if (row.keys.length < 5) row.keys.push(issue.key);
    byAssignee.set(name, row);
  }
  const members = [...byAssignee.values()]
    .map((m) => ({ ...m, overloaded: m.openCount > overloadAt }))
    .sort((a, b) => b.openCount - a.openCount);
  return { members, unassignedOpen: unassigned, overloaded: members.filter((m) => m.overloaded) };
}

// Workload rows from the Teamwork Graph (team-workload action): same shape,
// flagged the same way, so the agent and the UI can share one presentation.
export function flagOverload(members, overloadAt = 8) {
  const rows = members
    .map((m) => ({ ...m, overloaded: (m.openCount ?? 0) > overloadAt }))
    .sort((a, b) => (b.openCount ?? 0) - (a.openCount ?? 0));
  return { members: rows, overloaded: rows.filter((m) => m.overloaded) };
}

// ---- Sprint-review page (Confluence storage format) ----------------------
// Storage format is XHTML with Confluence macros; plain HTML tables render
// fine. Keep it simple and robust: headings, paragraphs, tables, links.

function reviewTable(headers, rows) {
  if (rows.length === 0) return "<p>None — nice work.</p>";
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("");
  return `<table><tbody><tr>${head}</tr>${body}</tbody></table>`;
}

function issueLink(key, webUrl, summary) {
  const label = `${escapeHtml(key)} — ${escapeHtml(summary || "")}`;
  return webUrl ? `<a href="${escapeHtml(webUrl)}">${label}</a>` : label;
}

export function buildReviewHtml({ sprint, health, stale, blocked, workload, projectKey, generatedAt }) {
  const sprintName = sprint?.name || `Open work in ${projectKey}`;
  const date = new Date(generatedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const daysLeftText =
    health.daysLeft === null ? "no end date set" : health.daysLeft <= 0 ? "ends today" : `${health.daysLeft} day(s) left`;

  return [
    `<h1>Sprint review — ${escapeHtml(sprintName)}</h1>`,
    `<p><em>Drafted by Sprint Scout on ${escapeHtml(date)}. Figures are a snapshot from Jira at draft time.</em></p>`,
    `<h2>Health</h2>`,
    `<p><strong>${health.donePct}% done</strong> — ${health.done} of ${health.total} work items finished, ` +
      `${health.inProgress} in progress, ${health.todo} to do. Sprint ${escapeHtml(daysLeftText)}. ` +
      `Signal: <strong>${escapeHtml(health.risk)}</strong> — ${escapeHtml(health.riskReason)}</p>`,
    `<h2>Stale work (${stale.length})</h2>`,
    `<p>Not updated in 3+ days and still open:</p>`,
    reviewTable(
      ["Work item", "Status", "Assignee", "Idle"],
      stale.map((s) => [
        issueLink(s.key, s.webUrl, s.summary),
        escapeHtml(s.status || "—"),
        escapeHtml(s.assignee || "Unassigned"),
        `${s.daysStale} day(s)`,
      ]),
    ),
    `<h2>Blocked work (${blocked.length})</h2>`,
    reviewTable(
      ["Work item", "Assignee", "Blocked by"],
      blocked.map((b) => [
        issueLink(b.key, b.webUrl, b.summary),
        escapeHtml(b.assignee || "Unassigned"),
        b.blockedBy.map((x) => `${escapeHtml(x.key)} (${escapeHtml(x.status || "—")})`).join(", "),
      ]),
    ),
    `<h2>Workload hotspots</h2>`,
    workload.overloaded.length === 0
      ? "<p>No one is carrying more than 8 open items.</p>"
      : reviewTable(
          ["Person", "Open items", "Sample"],
          workload.overloaded.map((m) => [
            escapeHtml(m.name),
            String(m.openCount),
            escapeHtml((m.keys || []).join(", ")),
          ]),
        ),
    workload.unassignedOpen > 0
      ? `<p>${workload.unassignedOpen} open item(s) have no assignee.</p>`
      : "",
    `<h2>Discussion prompts</h2>`,
    `<ul><li>What unblocked the finished work this sprint — and can we repeat it?</li>` +
      `<li>For each stale item: is it still needed, or should it leave the sprint?</li>` +
      `<li>Who can help the overloaded teammates before the sprint ends?</li></ul>`,
  ].join("\n");
}

// ---- Nudge comment (Atlassian Document Format) ---------------------------

export function buildNudgeAdf({ assigneeAccountId, assigneeName, issueKey, daysStale }) {
  const content = [];
  if (assigneeAccountId) {
    content.push({ type: "mention", attrs: { id: assigneeAccountId } });
    content.push({ type: "text", text: " " });
  } else if (assigneeName) {
    content.push({ type: "text", text: `${assigneeName} — ` });
  }
  content.push({
    type: "text",
    text:
      `Sprint Scout noticed ${issueKey} hasn't been updated in ${daysStale} day(s). ` +
      `A quick status update here would help the team plan the rest of the sprint — ` +
      `is it still on track, blocked, or no longer needed?`,
  });
  return { version: 1, type: "doc", content: [{ type: "paragraph", content }] };
}
