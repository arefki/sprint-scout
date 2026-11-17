# Devpost submission draft — Sprint Scout

Copy into the Devpost form at codegeist2026.devpost.com. Bracketed parts
[like this] must be filled in after the browser steps (install link, video
URL, repo URL).

---

## Project name

Sprint Scout

## Tagline (short)

A Rovo agent that keeps your Jira sprint healthy — spots stale and blocked
work, shows who's overloaded, and drafts your sprint review.

## Category

Apps for Software Teams

## Bonus prizes entered

- Best Agents — Rovo/Assignable agents
- Best app with Atlassian MCP
- Best apps with Teamwork Graph integration

(One entry can win one grand prize + one bonus prize.)

## Description

### Inspiration

Every sprint, the same three questions eat the standup: what went quiet,
what's blocked, and who's drowning? Scrum masters dig through the board by
hand to answer them — and by the time the answers are assembled, they're
stale. We wanted those answers in one chat message, and the follow-up done
automatically.

### What it does

Sprint Scout is a Forge app with three faces:

1. **A Rovo agent** you chat with in Jira. Ask "How healthy is our current
   sprint?" and it answers with progress, days left, and an on-track / watch
   / at-risk signal — with the reason, not just a number. Ask what's blocked
   or stale and it lists the items with assignees, days idle, and blocking
   keys. Ask who's overloaded and it reads team workload from the Teamwork
   Graph. And it does work, not just reports: "Draft our sprint review
   notes" creates a Confluence page (shipped / open / stale / blocked /
   hotspots / discussion prompts), and "Nudge the stale ones" posts a polite
   status-request comment — with a real @mention — on each stale item. Both
   write actions ask for confirmation first.
2. **A Jira dashboard** (global page) with the same health picture as a live
   view, saved settings, and one-click review drafting.
3. **A Jira issue panel** giving a one-glance verdict on the work item on
   screen — healthy, stale, blocked or done — with a one-click nudge.

The four read actions are also exposed as **MCP tools** (`rovo:mcp`), so any
agent in Rovo Studio — or any MCP-compatible client an admin enables — can
call them.

### How we built it

One Forge app, all Atlassian-native — no external services, no paid APIs.

- **Sprint data**: Jira Agile API (boards → active sprint → sprint issues),
  with a JQL fallback to all open work when there's no active sprint.
- **Team workload**: Teamwork Graph curated queries
  (`atlassianUserInTeams` → `atlassianTeamMembers` →
  `atlassianUserAssignedJiraWorkItems`), paged 25 rows at a time with
  retries, operation names following the `[company]_[operation]` rule.
- **Agent**: `rovo:agent` with 6 actions (4 GET, 2 CREATE) and a prompt that
  forbids guessing, requires confirmation before writes, and reports partial
  reads as "may be incomplete".
- **UI**: UI Kit (`@forge/react`) global page + issue panel, backed by one
  shared service layer — so the agent and the dashboard can never disagree.
- **Safety**: everything runs as the user, so every answer is
  permission-filtered to what that person can already see.

### Challenges we ran into

- **Rovo's practical limits**: actions must answer well inside ~20 s and
  ~1 MB, so workload caps at 12 members × 1 page each and sprint issues cap
  at 200.
- **Teamwork Graph quirks**: errors arrive as HTTP 200 with an `errors`
  array; a rate-limited call can return zero rows; a missing scope drops
  rows silently. The client treats all three as "could not read", never as
  "nothing there".
- **Status names vary by site**, so "done" is detected by status category
  first, names second.

### Accomplishments that we're proud of

- A complete product, not a demo: agent + dashboard + panel + MCP, sharing
  one analysis pipeline, with 19 unit tests.
- The agent *acts*: review drafts and nudges close the loop instead of just
  reporting.
- Honest answers: partial data is labelled partial, never presented as fact.

### What we learned

- The Teamwork Graph's curated-query model: typed root fields, per-object
  scopes, and paging discipline.
- Designing for an agent consumer is different from designing for a human:
  action descriptions are the UI, and the prompt is the product spec.
- `rovo:mcp` turns one app's actions into tools every other agent can reuse.

### What's next for Sprint Scout

- A scheduled Monday-morning digest (sprint health posted to the team's
  Confluence space or as a Jira comment).
- Sprint-over-sprint trends (velocity, recurring stale items) stored in
  Forge storage.
- A "suggest next action" step: propose reassigning overloaded members'
  work, for the user to approve.

## Installation link

https://developer.atlassian.com/console/install/a7e3c905-c264-4d1d-a1f2-8b97a832227c?signature=AYABeJQhiEBvOx8qWY3HYIHmUTUAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4CxqLTo9l4lqXuFjNim1xJM%2Bp%2F3TVP9xHS2BrU5DRRucB6tzAForNLe9lcooabxR%2BtAAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDHePYWnqecaTrAe7eAIBEIA7jwLMe8OgeMxB8g6KaPlMxARgE22KklNqC2nUPF6ZbMp4f9cxXcidaQxUdQ9k1Zo01f%2FIEub%2FXzNNRiEAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHi9bVMAkme4qVQX1fQHo6ePw3H40A7cGfz7yrmSfBWMXgHqwrMEqUaCvU2dmO4oTTEMAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMxkvwWPOvToiaZ3mrAgEQgDuI%2BLdjI6donL19Cb0r9YlOF9p94Qe%2BEm1eaAktZpklt4o84T1WAVwmBkbYGEoBBTmx9SzXWGNQppUJOAAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeDYASx0XCjkny4iLV6vz%2BKtEGSGT6kdt0QRpkn6D%2FlVEAfAdjX%2BQWK9nsghDu2IgK%2FsAAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAzZ%2FnXJ4H8SYJw8nTwCARCAOxXK75hp8U8EHUjQddL9IiVBknq9sHJSIb5iGOit9%2FFek3umycjwwTkBGiZdzVvBLzDZt%2FZHc1DpNILuAgAAAAAMAAAQAAAAAAAAAAAAAAAAAPm6vNSoF644RbVvIHK8u%2Bj%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADI4fFSgS9Ofx9KYnco4UIsQPh2sZkCI9Kq7TQhQS3q3fTEO9MHrVo6H%2F%2F3%2BVarmBJX%2F72M3wsU%2FUIltBxP6Zd0Noso%3D&product=jira

(Obtained 2026-11-18 ~03:31 WIB; also saved in docs/INSTALL-LINK.md.)

## Demo video

[PASTE the public YouTube URL — under 5 minutes]

## Repository

https://github.com/arefki/sprint-scout (public; pushed 2026-11-18 ~03:30 WIB, 23 files, commit aa4933a4)

## Setup steps for judges

1. Open the installation link above and install Sprint Scout on a Jira
   Cloud site (an org admin must approve the Teamwork Graph scopes).
2. You need a project with an **active sprint** (or any project with open
   work — the app falls back to all open work and says so). For the workload
   question, be a member of an Atlassian team with assigned work.
3. **Rovo agent**: open any work item → Open Rovo Chat → Change agent →
   Browse agents → "Sprint Scout". Try the conversation starters, e.g.
   "How healthy is our current sprint?" (Rovo requires a paid plan or a
   Standard/Premium trial.)
4. **Dashboard**: Apps → Sprint Scout. Save your project key (and a
   Confluence space key for review drafts), then Refresh health.
5. **Issue panel**: open any issue → ••• menu → Sprint Scout.
6. **MCP tools**: in Rovo Studio, add the "Sprint Scout MCP" tools to a
   custom agent. External MCP clients: an admin enables exposure in
   Atlassian Administration → Connected apps; endpoint
   `https://mcp.atlassian.com/forge/<appId>`.
7. To see a review draft: ask the agent "Draft our sprint review notes in
   the [SPACE] space" (or use the dashboard button) and confirm.

## Built with

Forge, Rovo, Atlassian MCP, Teamwork Graph API, Jira, Confluence, UI Kit

## Try it out links

- Installation link: [see Installation link section above]
- Demo video: [PASTE — pending Step 6]
- Source code: https://github.com/arefki/sprint-scout
