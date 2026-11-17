// Teamwork Graph (TWG) client for Sprint Scout's Forge backend functions.
//
// The Teamwork Graph API went to Preview on 15 October 2026. Apps read it
// through *curated* GraphQL queries (typed root fields) with one scope per
// object type, e.g. read:graph:issue:jira. Raw Cypher sent at request time
// is refused.
//
// Hard-won rules (verified on a live site, Oct 2026 — see README):
// - Every operation needs a name shaped `[company]_[operation]` (company >= 3
//   chars, operation >= 4). Without it the API answers HTTP 200 with a
//   DataFetchingException, so a check on res.ok alone passes.
// - Curated connections return at most 25 rows per page. Page with `after`,
//   and keep paging while hasNextPage is true even when a page comes back
//   short.
// - A rate-limited call can come back with zero rows. Treat "empty plus
//   errors" as "could not read", never as "nothing there", and retry transient
//   errors with backoff.
// - A missing scope drops rows silently (successful, empty response), so the
//   manifest declares one scope for every object type these queries touch.
// - @forge/api exposes requestTeamworkGraph on asUser() only. asUser answers
//   with what the person chatting can see — exactly what an agent wants.

import { asUser } from "@forge/api";

const OP_PREFIX = "scout_";

export const PAGE_SIZE = 25;

const TRANSIENT = /RATE_LIMIT|THROTTL|429|502|503|504/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One GraphQL call as the user, with up to 3 retries on transient errors.
// Answers { ok, data, error, ms } and never throws.
export async function twg(opName, query, variables) {
  const operationName = `${OP_PREFIX}${opName}`;
  const text = query.replace("query OP", `query ${operationName}`);
  const t0 = Date.now();

  for (let attempt = 0; ; attempt++) {
    let status = 0;
    let json = null;
    try {
      const res = await asUser().requestTeamworkGraph(text, variables, operationName);
      status = res.status;
      json = await res.json().catch(() => null);
    } catch (e) {
      json = { errors: [{ message: String(e?.message || e) }] };
    }

    const errors = Array.isArray(json?.errors) ? json.errors : [];
    const firstError = errors[0]
      ? `${errors[0].extensions?.classification || errors[0].extensions?.errorType || "error"}: ${String(errors[0].message).slice(0, 160)}`
      : status >= 400
        ? `http-${status}`
        : null;

    if (!firstError && json?.data) return { ok: true, data: json.data, ms: Date.now() - t0 };

    if (attempt < 3 && TRANSIENT.test(`${firstError} ${status}`)) {
      await sleep(Math.min(1200, 200 * 2 ** attempt) + Math.floor(Math.random() * 250));
      continue;
    }

    return { ok: false, error: firstError || "no-data", data: json?.data || null, ms: Date.now() - t0 };
  }
}

// Reads a curated connection page by page. `field` is the root field name in
// the query. Answers { ok, nodes, complete, error }. complete=false means we
// stopped early (maxPages) or a page failed.
export async function twgAll(opName, query, variables, field, maxPages = 4) {
  const nodes = [];
  let after = null;

  for (let page = 0; page < maxPages; page++) {
    const r = await twg(opName, query, { ...variables, first: PAGE_SIZE, after });
    if (!r.ok) return { ok: nodes.length > 0, nodes, complete: false, error: r.error };

    const conn = r.data?.[field];
    if (!conn || !Array.isArray(conn.edges)) return { ok: false, nodes, complete: false, error: "no-connection" };

    for (const e of conn.edges) if (e?.node) nodes.push(e.node);

    // Keep paging while the API says there is more, even when a page came back short.
    if (!conn.pageInfo?.hasNextPage || !conn.pageInfo?.endCursor) return { ok: true, nodes, complete: true };
    after = conn.pageInfo.endCursor;
  }

  return { ok: true, nodes, complete: false, error: "stopped-after-max-pages" };
}

export const Q = {
  userTeams: `query OP($userId: ID!, $first: Int, $after: String) {
    atlassianUserInTeams(userId: $userId, first: $first, after: $after) {
      edges { node { ... on AtlassianTeam { id displayName } } }
      pageInfo { hasNextPage endCursor }
    }
  }`,

  teamMembers: `query OP($teamAri: ID!, $first: Int, $after: String) {
    atlassianTeamMembers(teamAri: $teamAri, first: $first, after: $after) {
      edges { node { ... on AtlassianUser { accountId name } } }
      pageInfo { hasNextPage endCursor }
    }
  }`,

  assignedWork: `query OP($userId: ID!, $first: Int, $after: String) {
    atlassianUserAssignedJiraWorkItems(userId: $userId, first: $first, after: $after) {
      edges { node { ... on JiraWorkItem { key summary webUrl status { name } } } }
      pageInfo { hasNextPage endCursor }
    }
  }`,

  workItemComments: `query OP($id: ID!, $since: String!, $first: Int, $after: String) {
    jiraWorkItemComments(id: $id, since: $since, first: $first, after: $after) {
      edges { node { ... on JiraWorkItemComment { createdAt author { name ... on AtlassianUser { accountId } } } } }
      pageInfo { hasNextPage endCursor }
    }
  }`,
};
