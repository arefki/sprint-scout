// Seed the Forge demo site (one-atlas-bkwu.atlassian.net) with the same
// DEMO project + Sprint 12 + 12 issues + Confluence space TEAM that the main
// site (eqiverse.atlassian.net) has, so the Rovo agent can be tested there
// (Rovo Chat does not exist on the main Standard-trial site).
//
// Usage: ATLASSIAN_API_TOKEN=<token> node scripts/seed-demo-site.mjs
// The token is Eki's Atlassian API token (keyring service forge-apitoken);
// pass it via env, never commit it. Safe to re-run ONLY on a fresh site —
// it fails fast if project DEMO already exists.

const SITE = "https://one-atlas-bkwu.atlassian.net";
const EMAIL = "eqiverse@gmail.com";
const TOKEN = process.env.ATLASSIAN_API_TOKEN;
if (!TOKEN) throw new Error("ATLASSIAN_API_TOKEN env var required");
const AUTH = "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");

const ACCOUNT_ID = "712020:6780fc01-a4c3-4134-8406-66c93cd3b074"; // eqiverse

// Mirrors the main site exactly (verified via API 2026-11-17).
const ISSUES = [
  { n: 1, type: "Story", status: "To Do", summary: "Add retry logic to checkout API" },
  { n: 2, type: "Task", status: "To Do", summary: "Fix login redirect loop on mobile web" },
  { n: 3, type: "Bug", status: "To Do", summary: "Cart total miscalculates with stacked coupons" },
  { n: 4, type: "Story", status: "To Do", summary: "Add passwordless login via magic link" },
  { n: 5, type: "Task", status: "To Do", summary: "Migrate session store to Redis" },
  { n: 6, type: "Task", status: "To Do", summary: "Write API docs for the billing endpoints" },
  { n: 7, type: "Story", status: "In Progress", summary: "Redesign onboarding checklist" },
  { n: 8, type: "Task", status: "In Progress", summary: "Add rate limiting to public API" },
  { n: 9, type: "Bug", status: "In Progress", summary: "Search results ignore the locale filter" },
  { n: 10, type: "Task", status: "In Progress", summary: "Set up staging environment autoscaling" },
  { n: 11, type: "Story", status: "Done", summary: "Add dark mode to the settings page" },
  { n: 12, type: "Task", status: "Done", summary: "Upgrade Node runtime to v22" },
];

async function call(method, path, body) {
  const res = await fetch(`${SITE}${path}`, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

const log = (...a) => console.log(...a);

// 1. Project DEMO (scrum template).
const existing = await call("GET", "/rest/api/3/project/DEMO").catch(() => null);
if (existing) throw new Error("Project DEMO already exists on the demo site — refusing to re-seed.");
const project = await call("POST", "/rest/api/3/project", {
  key: "DEMO",
  name: "Demo Sprint Space",
  projectTypeKey: "software",
  projectTemplateKey: "com.pyxis.greenhopper.jira:gh-scrum-template",
  leadAccountId: ACCOUNT_ID,
});
log("project created:", project.key, project.id);

// 2. Board id.
const boards = await call("GET", "/rest/agile/1.0/board?projectKeyOrId=DEMO&maxResults=5");
const board = boards.values[0];
if (!board) throw new Error("No board found for DEMO");
log("board:", board.id, board.name);

// 3. Issues in order (keys come out DEMO-1..12).
const keys = [];
for (const it of ISSUES) {
  const created = await call("POST", "/rest/api/3/issue", {
    fields: {
      project: { key: "DEMO" },
      summary: it.summary,
      issuetype: { name: it.type },
      priority: { name: "Medium" },
      assignee: { accountId: ACCOUNT_ID },
    },
  });
  keys.push(created.key);
  log("created:", created.key, it.summary);
}

// 4. Status transitions (To Do is default; move the rest).
for (const it of ISSUES) {
  if (it.status === "To Do") continue;
  const key = `DEMO-${it.n}`;
  const tr = await call("GET", `/rest/api/3/issue/${key}/transitions`);
  const t = (tr.transitions || []).find((x) => x.to?.name === it.status);
  if (!t) throw new Error(`No transition to ${it.status} for ${key}`);
  await call("POST", `/rest/api/3/issue/${key}/transitions`, { transition: { id: t.id } });
  log("transitioned:", key, "->", it.status);
}

// 5. Sprint: create, add issues, start (now -> +14 days).
const sprint = await call("POST", "/rest/agile/1.0/sprint", {
  name: "Sprint 12",
  originBoardId: board.id,
  goal: "Demo sprint: checkout reliability, login improvements, and platform upgrades.",
});
log("sprint created:", sprint.id, sprint.name);
await call("POST", `/rest/agile/1.0/sprint/${sprint.id}/issue`, { issues: keys });
log("issues moved to sprint:", keys.length);
const now = new Date();
const end = new Date(now.getTime() + 14 * 24 * 3600 * 1000);
await call("PUT", `/rest/agile/1.0/sprint/${sprint.id}`, {
  name: "Sprint 12", // required by the update endpoint, even when unchanged
  state: "active",
  startDate: now.toISOString(),
  endDate: end.toISOString(),
});
log("sprint started: active until", end.toISOString());

// 6. Link: DEMO-10 blocks DEMO-5 (DEMO-5 "is blocked by" DEMO-10).
await call("POST", "/rest/api/3/issueLink", {
  type: { name: "Blocks" },
  inwardIssue: { key: "DEMO-5" },
  outwardIssue: { key: "DEMO-10" },
});
log("link created: DEMO-10 blocks DEMO-5");

// 7. Confluence space TEAM (v1; Basic auth still serves it).
const space = await call("POST", "/wiki/rest/api/space", { key: "TEAM", name: "Team" }).catch(async (e) => {
  log("v1 space create failed, trying v2:", String(e.message).slice(0, 120));
  return call("POST", "/wiki/api/v2/spaces", { key: "TEAM", name: "Team" });
});
log("Confluence space created:", space.key, space.id);

log("SEED DONE");
