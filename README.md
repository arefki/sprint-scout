# Sprint Scout — a Forge app for Codegeist 2026

> **The one-line pitch:** Sprint Scout keeps your Jira sprint healthy. It spots
> stale and blocked work, shows who's overloaded, and drafts your sprint review
> — through a Rovo agent you can chat with, a dashboard, and an issue panel.

Built for [Codegeist 2026](https://codegeist2026.devpost.com) (Atlassian's
annual Forge hackathon). Category: **Apps for Software Teams**. Also entered
for the **Best Agents**, **Best app with Atlassian MCP** and **Best Teamwork
Graph integration** bonuses (one entry can win one grand prize + one bonus).

## The problem

Sprint reviews and standups waste time because nobody has a live picture of
sprint health. A scrum master digs through the board by hand to answer three
questions: *what went quiet, what's blocked, and who's drowning?* By the time
the answers are assembled, they're stale.

## What it does

**A Rovo agent — "Sprint Scout"** you chat with in Jira:

| Ask it | It does |
|---|---|
| "How healthy is our current sprint?" | Sprint progress, days left, an on-track / watch / at-risk signal |
| "What's blocked right now?" | Blocked items + their blocking keys |
| "Which issues went stale?" | Items untouched for N days, stalest first |
| "Who on my team is overloaded?" | Team workload from the **Teamwork Graph**, overloaded members flagged |
| "Draft our sprint review notes" | Creates a **Confluence page** with shipped / open / stale / blocked / hotspots |
| "Nudge the stale ones" | Posts a polite status-request comment on each stale item |

**A Jira dashboard** (global page): the same health picture as a live view —
sprint progress, stale list, blocked list, workload hotspots — with saved
settings (project, Confluence space, stale threshold) and a one-click
sprint-review draft.

**A Jira issue panel**: a one-glance verdict on the work item on screen
(healthy / stale / blocked / done) with a one-click nudge to the assignee.

**MCP tools** (`rovo:mcp`): the four read actions are exposed as MCP tools,
so other agents in Rovo Studio — or any MCP-compatible client an admin
enables — can call them too.

Everything runs **as the user**, so answers are permission-filtered to what
that person can already see in Jira. Nothing is guessed: partial reads are
reported as "may be incomplete", and the write actions only run after the
user confirms in chat.

## Architecture

```
manifest.yml            rovo:agent · rovo:mcp · 6 actions · jira:globalPage
                        · jira:issuePanel · 12 scopes (see below)
prompts/prompt.md       the agent's instructions (never guess, confirm writes)
src/index.js            the 6 Rovo action handlers
src/twg.js              Teamwork Graph client (curated queries, paging, retry)
src/jira.js             Jira REST + Agile API (asUser)
src/confluence.js       Confluence page creation (asUser)
src/service.js          shared pipeline: load sprint → analyse → draft / nudge
src/resolvers.js        UI Kit backend (dashboard + panel)
src/frontend/index.jsx  dashboard global page (UI Kit / @forge/react)
src/frontend/issue-panel.jsx   issue panel (UI Kit)
src/lib/health.js       pure analysis: stale / blocked / health / workload /
                        review HTML / nudge ADF — fully unit-tested
src/lib/util.js         pure helpers: ARIs, JQL, statuses, dates
test/health.test.js     19 unit tests (node --test, zero dependencies)
```

The agent and the dashboard share `src/service.js`, so they can never
disagree about what "stale" or "healthy" means.

## How it works, technically

- **Sprint data** comes from the Jira Agile API (`/rest/agile/1.0`): boards →
  active sprint → sprint issues. When a project has no active sprint (or no
  board), it falls back to a JQL search for all open work and says so.
- **Stale** = open + not updated in N days (default 3). **Blocked** = an open
  inward "is blocked by" link whose blocker is not done. **Health signal** =
  done-% vs elapsed-% of the sprint, with an explainable reason string.
- **Team workload** reads the **Teamwork Graph** (Preview since 15 Oct 2026)
  through curated queries: `atlassianUserInTeams` → `atlassianTeamMembers` →
  `atlassianUserAssignedJiraWorkItems`, 25 rows a page, with retries on
  transient errors. Operation names follow the `[company]_[operation]` rule.
- **Review pages** are created in Confluence storage format (XHTML tables).
- **Nudges** are ADF comments with a real `@mention` of the assignee.
- **MCP**: `rovo:mcp` exposes the four GET actions as tools. External MCP
  exposure stays off until a site/org admin enables it (Atlassian
  Administration → Connected apps).

## Scopes (12)

| Scope | Why |
|---|---|
| `read:jira-work` | read issues, JQL search |
| `read:jira-user` | resolve people by name |
| `write:jira-work` | post nudge comments |
| `read:board-scope:jira-software` | list boards |
| `read:sprint:jira-software` | read active sprint + issues |
| `write:confluence-content` | create review pages (the create response carries the page URL, so no read scope is needed) |
| `storage:app` | Forge storage for the dashboard settings |
| `read:graph:issue:jira`, `read:graph:issue-status:jira`, `read:graph:issue-comment:jira`, `read:graph:user:atlassian`, `read:graph:team:atlassian` | Teamwork Graph (one per object type the queries touch) |

## Prerequisites (all free)

- Node.js 22.23.4+ and the Forge CLI (`npm i -g @forge/cli`, currently 15.1.0)
- A free Atlassian account + a Jira Cloud site. **Note:** Rovo is a paid-plan
  feature — test the agent on a **Standard or Premium trial** site (the trial
  includes Rovo). The dashboard and issue panel work on a free site; the
  Teamwork Graph queries also answered on a free site in testing (Oct 2026).
- Installing an app with Teamwork Graph scopes needs an **organization admin**.

## Deploy & install

```bash
# 1. Create the app (registers it and writes the real app id into a fresh
#    manifest — keep that id line, then copy this repo's files over it).
forge create            # pick any Jira template; files here replace it

# 2. Install dependencies and check the app.
npm install
npm test                # 19 unit tests
npx forge lint          # validates manifest + handlers (needs login)
npm run lint:offline    # same client-side linters, no login needed

# 3. Deploy + install on your dev site (org admin approves the graph scopes).
forge deploy -e development
forge install -e development --site <your-site>.atlassian.net --product jira

# 4. Try it: open a work item → Open Rovo Chat → Change agent → Browse agents
#    → "Sprint Scout". Or open Apps → Sprint Scout for the dashboard.
forge logs -e development   # one JSON line per action call
```

## Submit to Codegeist 2026

1. Deploy to production and create the **installation link** judges use:
   `forge deploy -e production`, then in the [developer console](https://developer.atlassian.com/console)
   → your app → Distribution → Sharing (NOT "Sharing within organization" —
   outsiders can't install that one). Copy the link.
2. Record the demo video (< 5 min, public on YouTube) — script in
   [`docs/DEMO-SCRIPT.md`](docs/DEMO-SCRIPT.md).
3. Fill in the Devpost form — description draft in
   [`docs/DEVPOST-DRAFT.md`](docs/DEVPOST-DRAFT.md).
4. Deadline: **Tue 22 Dec 2026, 12:00 PM PT** (Wed 23 Dec 2026, 03:00 WIB).

Full step-by-step for the human/browser steps:
[`docs/PARENT-CHECKLIST.md`](docs/PARENT-CHECKLIST.md).

## Design decisions & honest limitations

- **No external APIs, no paid services.** Everything is Atlassian-native
  (Jira, Confluence, Teamwork Graph, Rovo). The app is free to run.
- **Read actions are GET, write actions are CREATE** — and the prompt requires
  user confirmation before any write. Automation-triggered agents can't call
  CREATE actions; chat-triggered agents can.
- **Rovo's practical limits shaped the code**: actions stay well under ~20 s
  and ~1 MB (team workload caps at 12 members × 1 page each; sprint issues
  cap at 200; stale/blocked lists cap at 25 in agent answers).
- **Status names vary by site.** "Done" detection checks the status *category*
  first (workflow-independent) and falls back to the names Done/Closed/Resolved.
- **Teamwork Graph is Preview.** Curated queries, per-object scopes and the
  operation-name rule are as documented in Oct–Nov 2026; check the
  [Teamwork Graph changelog](https://developer.atlassian.com/platform/forge/teamwork-graph/)
  before relying on them long-term.
- **Not yet live-tested end-to-end.** The code is linted and unit-tested, but
  it has not been deployed to a real Jira site yet — the first deploy is the
  moment of truth (see the checklist for a smoke-test plan). The Teamwork
  Graph client follows patterns verified on a live site in Oct 2026
  (see "References" below).

## References

- Forge docs: https://developer.atlassian.com/platform/forge/
- Rovo MCP module: https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/
- Teamwork Graph + Rovo agent tutorial (patterns this app's `twg.js` follows):
  https://dev.to/mihai_leanzero/atlassian-teamwork-graph-api-forge-rovo-agent-3mcc
- Codegeist 2026: https://codegeist2026.devpost.com

## License

MIT — free to use, modify and submit.
