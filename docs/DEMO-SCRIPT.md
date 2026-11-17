# Demo video script — Sprint Scout (< 5 minutes)

Target length: **4:00–4:30**. Public YouTube video, unlisted is NOT enough —
Devpost requires public. Record at 1080p, narrate clearly, show the app
working in the first 60 seconds (judges aren't required to watch past 5:00).

## Setup before recording

- Jira trial site (Standard/Premium trial so Rovo works) with a project that
  has an **active sprint** containing:
  - ~10 issues across To Do / In Progress / Done
  - 2–3 issues untouched for 3+ days (stale) — create them, then wait, or
    backdate by creating them days before recording
  - 1 issue with an "is blocked by" link to another open issue
  - 1 teammate with 9+ open items (overloaded) — or use your own account
- An Atlassian team with 2–3 members (for the workload question).
- A Confluence space you can create pages in (note its key).
- Sprint Scout installed (dev environment is fine for the demo).
- Close unrelated tabs; zoom the browser to 110–125% so text is readable.

## Script

### 0:00–0:30 — The problem (talking head or Jira board on screen)

> "Every sprint, the same three questions eat the standup: what went quiet,
> what's blocked, and who's drowning? Scrum masters dig through the board by
> hand — and by the time they have answers, the answers are stale. Sprint
> Scout is a Rovo agent that answers all three in one chat — and drafts your
> sprint review for you."

### 0:30–1:30 — The agent in Rovo chat (THE CORE DEMO — show it working)

1. Open a work item → **Open Rovo Chat** → Change agent → Browse agents →
   **Sprint Scout**. Show the description + conversation starters.
2. Ask: **"How healthy is our current sprint?"**
   Narrate the answer: progress %, days left, the on-track/watch/at-risk
   signal and why.
3. Ask: **"What's blocked right now?"** — point at the blocking keys.
4. Ask: **"Which issues went stale?"** — point at days-idle + assignees.
5. Ask: **"Who on my team is overloaded?"** — this is the Teamwork Graph
   answer; say so: *"That comes from the Teamwork Graph — who works on what,
   across the org."*

(Each chat answer takes ~30 s while Rovo writes — **edit the waiting out**.
Cut from question to answer; a jump cut with a "…" caption is fine.)

### 1:30–2:15 — The agent does work (write actions)

6. Ask: **"Draft our sprint review notes in the TEAM space."**
   Confirm when it asks. Show the Confluence page it creates — scroll through
   Health / Stale / Blocked / Hotspots / Discussion prompts.
7. Ask: **"Nudge the stale ones."** Confirm. Show one issue's new comment
   with the @mention.

### 2:15–3:15 — The dashboard + issue panel (it's a complete product)

8. **Apps → Sprint Scout** (global page): show the settings form, the health
   summary, stale/blocked lists, workload hotspots. Click **Refresh health**.
9. Open a stale issue → the **Sprint Scout panel**: show the "stale" verdict
   and the **Nudge** button (don't click it again — you already nudged it).

### 3:15–3:50 — Under the hood (one slide or the repo on screen)

> "Under the hood: one Forge app. Six Rovo actions — four reads, two
> confirmed writes. The same reads are exposed as MCP tools, so any agent in
> Rovo Studio can call them. Workload comes from the Teamwork Graph's curated
> queries. Everything runs as the user, so answers are permission-filtered —
> the agent never shows work you can't already see. No external services, no
> paid APIs."

Show briefly: manifest modules list / the repo tree (5 seconds, no code
reading).

### 3:50–4:15 — Close

> "Sprint Scout: ask it how the sprint is doing, and it tells you — then
> does something about it. Built on Forge for Codegeist 2026. Installation
> link and setup steps are in the project description."

End card (5 s): app name + Devpost project URL.

## Editing notes

- Cut all waiting time; keep every answer on screen ≥ 3 s so it's readable.
- Add captions or on-screen labels for each question ("1 · Sprint health",
  "2 · Blockers", …) so a muted viewer still follows.
- If a live answer is slow or imperfect, re-record that segment — do not
  fake it with screenshots.
- Background music: optional, low volume, royalty-free only.
