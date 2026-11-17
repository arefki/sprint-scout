// Sprint Scout — Rovo agent actions.
//
// Each export is one `action` module in the manifest. Rovo calls it with the
// inputs the model filled in plus a context object:
//   payload.context.accountId — the person chatting
//   payload.context.jira.issueKey / issueId — the work item on screen, if any
//   payload.context.cloudId — the site
//
// Rules every action follows:
// - Run as the user (asUser), so answers are permission-filtered.
// - Answer JSON Rovo can turn into prose; keep it well under 1 MB and well
//   under Rovo's ~20 s per-action budget.
// - Never guess: anything partial goes into `notes`, and the agent prompt
//   tells Rovo to report those as "may be incomplete".
// - Write actions (CREATE) only run when the user asked for them — the agent
//   prompt requires confirmation before calling them.

import { flagOverload } from "./lib/health.js";
import { userAri } from "./lib/util.js";
import { analyseSprint, draftSprintReview, nudgeStaleIssues } from "./service.js";
import { askerOf, personName, resolveProject } from "./jira.js";
import { Q, twgAll } from "./twg.js";

const log = (event, data) => console.log(JSON.stringify({ scout: event, ...data }));

// --- shared Teamwork Graph helpers (team workload) -------------------------

async function teamsOf(accountId, notes) {
  const r = await twgAll("userTeams", Q.userTeams, { userId: userAri(accountId) }, "atlassianUserInTeams");
  if (!r.ok) notes.push(`teams could not be read: ${r.error}`);
  else if (!r.complete) notes.push("team list may be incomplete");
  return r.nodes.map((t) => ({ id: t.id, name: t.displayName }));
}

async function assignedTo(accountId, notes, maxPages = 1) {
  const r = await twgAll(
    "assignedWork",
    Q.assignedWork,
    { userId: userAri(accountId) },
    "atlassianUserAssignedJiraWorkItems",
    maxPages,
  );
  if (!r.ok) notes.push(`assigned work could not be read: ${r.error}`);
  else if (!r.complete) notes.push("assigned list may be incomplete");
  return r.nodes.map((n) => ({
    key: n.key,
    summary: n.summary,
    status: n.status?.name || null,
    webUrl: n.webUrl,
  }));
}

const isOpenWork = (w) => w.status && !/^(done|closed|resolved)$/i.test(w.status);

// --- GET actions -----------------------------------------------------------

export async function sprintHealth(payload) {
  const t0 = Date.now();
  const resolved = resolveProject(payload);
  if (resolved.error) return { error: resolved.error };
  try {
    const a = await analyseSprint(resolved.projectKey);
    log("sprint-health", { ms: Date.now() - t0, project: resolved.projectKey, mode: a.mode, total: a.health.total });
    return {
      project: resolved.projectKey,
      mode: a.mode,
      sprint: a.sprint,
      board: a.board,
      health: a.health,
      staleCount: a.stale.length,
      blockedCount: a.blocked.length,
      overloadedCount: a.workload.overloaded.length,
      notes: a.notes,
    };
  } catch (e) {
    return { error: `Could not read the sprint for ${resolved.projectKey}: ${String(e.message).slice(0, 200)}` };
  }
}

export async function staleIssues(payload) {
  const t0 = Date.now();
  const resolved = resolveProject(payload);
  if (resolved.error) return { error: resolved.error };
  try {
    const a = await analyseSprint(resolved.projectKey, payload?.days);
    log("stale-issues", { ms: Date.now() - t0, project: resolved.projectKey, stale: a.stale.length });
    return {
      project: resolved.projectKey,
      sprint: a.sprint?.name || null,
      staleDays: payload?.days || 3,
      stale: a.stale.slice(0, 25),
      totalStale: a.stale.length,
      notes: a.notes,
    };
  } catch (e) {
    return { error: `Could not read stale issues for ${resolved.projectKey}: ${String(e.message).slice(0, 200)}` };
  }
}

export async function blockedIssues(payload) {
  const t0 = Date.now();
  const resolved = resolveProject(payload);
  if (resolved.error) return { error: resolved.error };
  try {
    const a = await analyseSprint(resolved.projectKey);
    log("blocked-issues", { ms: Date.now() - t0, project: resolved.projectKey, blocked: a.blocked.length });
    return {
      project: resolved.projectKey,
      sprint: a.sprint?.name || null,
      blocked: a.blocked.slice(0, 25),
      totalBlocked: a.blocked.length,
      notes: a.notes,
    };
  } catch (e) {
    return { error: `Could not read blocked issues for ${resolved.projectKey}: ${String(e.message).slice(0, 200)}` };
  }
}

export async function teamWorkload(payload) {
  const t0 = Date.now();
  const notes = [];
  const asker = askerOf(payload);
  if (!asker) return { error: "I could not tell who is asking." };

  const wanted = String(payload?.team || "").trim().toLowerCase();
  // Teams are found through the asker: the curated API starts from a user id
  // or a team id, not a team name.
  const myTeams = await teamsOf(asker, notes);
  const team = wanted ? myTeams.find((t) => t.name.toLowerCase().includes(wanted)) : myTeams[0];
  if (!team && wanted) {
    return { error: `You are not in a team called "${payload.team}". Your teams: ${myTeams.map((t) => t.name).join(", ") || "none"}.` };
  }
  if (!team) return { error: "You are not in any Atlassian team yet.", notes };

  const members = await twgAll("teamMembers", Q.teamMembers, { teamAri: team.id }, "atlassianTeamMembers");
  if (!members.ok) return { error: `Members of ${team.name} could not be read: ${members.error}` };

  // One page of assigned work per member (max 12 members) keeps the call
  // well inside Rovo's ~20 s per action.
  const rows = [];
  for (const m of members.nodes.slice(0, 12)) {
    const work = await assignedTo(m.accountId, notes, 1);
    const open = work.filter(isOpenWork);
    rows.push({ name: m.name, openCount: open.length, open: open.slice(0, 5) });
  }
  if (members.nodes.length > 12) notes.push(`showing 12 of ${members.nodes.length} members`);

  const flagged = flagOverload(rows);
  log("team-workload", { ms: Date.now() - t0, team: team.name, members: members.nodes.length });
  return {
    team: team.name,
    members: flagged.members,
    overloaded: flagged.overloaded,
    notes: [...new Set(notes)],
  };
}

// --- CREATE actions (user-confirmed by the agent prompt) -------------------

export async function sprintReviewDraft(payload) {
  const t0 = Date.now();
  const resolved = resolveProject(payload);
  if (resolved.error) return { error: resolved.error };
  const spaceKey = String(payload?.spaceKey || "").trim().toUpperCase();
  if (!spaceKey) return { error: "Which Confluence space? Give me a space key such as TEAM." };
  try {
    const result = await draftSprintReview(resolved.projectKey, spaceKey);
    log("sprint-review-draft", { ms: Date.now() - t0, project: resolved.projectKey, page: result.page.id });
    return {
      created: true,
      pageTitle: result.page.title,
      pageUrl: result.page.url,
      project: result.projectKey,
      sprint: result.sprint,
      counts: result.counts,
      notes: result.notes,
    };
  } catch (e) {
    return { error: `Could not create the review page: ${String(e.message).slice(0, 200)}` };
  }
}

export async function nudgeStale(payload) {
  const t0 = Date.now();
  const resolved = resolveProject(payload);
  if (resolved.error) return { error: resolved.error };
  try {
    const result = await nudgeStaleIssues(resolved.projectKey, payload?.days, payload?.maxIssues);
    log("nudge-stale", {
      ms: Date.now() - t0,
      project: resolved.projectKey,
      nudged: result.nudged.length,
      skipped: result.skipped.length,
    });
    return {
      project: result.projectKey,
      sprint: result.sprint,
      staleFound: result.staleFound,
      nudged: result.nudged,
      skipped: result.skipped,
      notes: result.notes,
    };
  } catch (e) {
    return { error: `Could not send nudges for ${resolved.projectKey}: ${String(e.message).slice(0, 200)}` };
  }
}

// Kept for the resolver module's shared use (the dashboard greets the user).
export async function whoAmI(payload) {
  const id = askerOf(payload);
  if (!id) return { error: "I could not tell who is asking." };
  return { name: await personName(id) };
}
