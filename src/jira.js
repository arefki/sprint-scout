// Jira REST helpers for Sprint Scout. All calls run as the user (asUser),
// so every answer is permission-filtered to what that person can already see
// in Jira — the agent never leaks work items the asker cannot see.
//
// Endpoints used (platform API only — see getActiveSprint for why the Agile
// API is deliberately NOT used):
// - /rest/api/3/search/jql, /issue/{key}, /issue/{key}/comment,
//   /user/search, /user (scopes read:jira-work, read:jira-user,
//   write:jira-work)

import { asUser, route } from "@forge/api";

import { normaliseProjectKey, openWorkJql, projectKeyFromIssueKey } from "./lib/util.js";

const ISSUE_FIELDS = "summary,status,assignee,reporter,updated,issuelinks,priority";

// Resolve the project a call is about: an explicit projectKey wins; otherwise
// fall back to the project of the work item open on screen (Rovo puts it in
// payload.context.jira.issueKey). Returns { projectKey } or { error }.
export function resolveProject(payload) {
  const explicit = normaliseProjectKey(payload?.projectKey);
  if (explicit) return { projectKey: explicit };
  if (payload?.projectKey) {
    return { error: `"${payload.projectKey}" is not a valid Jira project key (for example PROJ).` };
  }
  const fromContext = projectKeyFromIssueKey(payload?.context?.jira?.issueKey);
  if (fromContext) return { projectKey: fromContext };
  return { error: "Which project? Give me a project key such as PROJ, or open a work item from that project first." };
}

// The person chatting, for "my team" / "what am I working on" questions.
export const askerOf = (payload) => payload?.context?.accountId || null;

async function jiraGet(routeObj) {
  // route`` is REQUIRED: @forge/api refuses plain strings to requestJira
  // ("You must create your route using the 'route' export from '@forge/api'").
  // route encodes only the interpolated values; literal path slashes and
  // query keys pass through untouched. Callers must NOT pre-encode values
  // with encodeURIComponent — route does the encoding, and double-encoding
  // would corrupt JQL (e.g. %20 -> %2520).
  const res = await asUser().requestJira(routeObj);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`jiraGet failed (${res.status}): ${body.slice(0, 500)}`);
    throw new Error(`Jira request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Find the active sprint for a project WITHOUT the Agile API: Forge's asUser
// token gets 401 "Authentication Required" on /rest/agile/1.0 (verified
// 2026-11-17 — the same call works with Basic auth, so the endpoint is fine
// and the Forge user token is what the Agile API rejects). JQL
// `sprint in openSprints()` plus the sprint custom field (customfield_10020,
// verified on this site) give the same answer through the platform API,
// which only needs read:jira-work. Returns { board, sprint } or null.
export async function getActiveSprint(projectKey) {
  const page = await jiraGet(
    route`/rest/api/3/search/jql?jql=${`project = ${projectKey} AND sprint in openSprints()`}&fields=customfield_10020&maxResults=1`,
  );
  const issue = (page.issues || [])[0];
  const sprints = issue?.fields?.customfield_10020 || [];
  const active = sprints.find((s) => s.state === "active");
  if (!active) return null;
  return {
    board: active.boardId ? { id: active.boardId, name: null } : null,
    sprint: active,
  };
}

// Issues in a sprint, paged via the platform search API (same Agile-API
// avoidance as getActiveSprint — sprint ids are site-unique, so
// `sprint = <id>` needs no project qualifier). Caps at 200 to stay inside
// Rovo's ~20 s action budget.
export async function getSprintIssues(sprintId, maxTotal = 200) {
  const issues = [];
  let nextPageToken = null;
  for (;;) {
    const page = nextPageToken
      ? await jiraGet(
          route`/rest/api/3/search/jql?jql=${`sprint = ${sprintId}`}&fields=${ISSUE_FIELDS}&maxResults=100&nextPageToken=${nextPageToken}`,
        )
      : await jiraGet(
          route`/rest/api/3/search/jql?jql=${`sprint = ${sprintId}`}&fields=${ISSUE_FIELDS}&maxResults=100`,
        );
    issues.push(...(page.issues || []));
    nextPageToken = page.nextPageToken || null;
    if (!nextPageToken || issues.length >= maxTotal || !page.issues?.length) break;
  }
  return issues.slice(0, maxTotal);
}

// Fallback when there is no active sprint: all open work in the project,
// stalest first.
export async function getOpenIssues(projectKey, maxResults = 100) {
  const jql = openWorkJql(projectKey);
  const page = await jiraGet(
    route`/rest/api/3/search/jql?jql=${jql}&fields=${ISSUE_FIELDS}&maxResults=${maxResults}`,
  );
  return page.issues || [];
}

export async function getIssue(issueKey) {
  const res = await asUser().requestJira(
    route`/rest/api/3/issue/${issueKey}?fields=summary,status,assignee,reporter,updated,issuelinks,priority,comment`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not read ${issueKey} (${res.status}).`);
  return res.json();
}

// Post a comment (ADF body) on an issue. Returns the created comment.
export async function addComment(issueKey, adfBody) {
  const res = await asUser().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: adfBody }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Could not comment on ${issueKey} (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Resolve a name or email to one Jira user, as the person asking (they only
// find who they can see). Returns { accountId, name } or { error }.
export async function findPerson(text) {
  const res = await asUser().requestJira(route`/rest/api/3/user/search?query=${text}&maxResults=5`);
  if (!res.ok) return { error: `user search failed (${res.status})` };
  const users = (await res.json()).filter((u) => u.accountType === "atlassian" && u.active);
  if (users.length === 0) return { error: `no active person matches "${text}"` };
  if (users.length > 1) {
    return {
      error: `"${text}" matches ${users.length} people: ${users.map((u) => u.displayName).join(", ")}. Ask which one.`,
    };
  }
  return { accountId: users[0].accountId, name: users[0].displayName };
}

export async function personName(accountId) {
  const res = await asUser().requestJira(route`/rest/api/3/user?accountId=${accountId}`);
  return res.ok ? (await res.json()).displayName : accountId;
}
