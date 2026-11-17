# Parent checklist — browser + account steps for Sprint Scout

The code is done. Everything below needs a browser and/or Eki's accounts —
none of it can be done by the build subagent. Do the steps in order; each
one unlocks the next.

**Deadline: Tue 22 Dec 2026, 12:00 PM PT = Wed 23 Dec 2026, 03:00 WIB.**
Winners ~15 Feb 2027. Payout (if we win) needs Eki personally: identity
affidavit + W-8BEN tax form + bank details within 10 business days.

## Progress log (2026-11-17)

- Steps 1–3 DONE: site eqiverse.atlassian.net (Jira + Confluence Standard
  trials end Dec 1, 2026), Devpost "eqiverse" registered, project DEMO with
  active Sprint 12 (12 issues), team "Demo Team" created.
- Smoke test #1 (22:20–22:36 WIB): dashboard + panel both stuck loading;
  Rovo agent not listed in admin. Root cause: `new Resolver()` crashed every
  invocation (ESM/CJS interop, @forge/resolver). Fixed in v2.1.0 (named
  `makeResolver` + named `asUser`/`route` imports), deployed 22:46 WIB.
- Smoke test #2 (22:54–23:01 WIB, v2.1.0): **issue panel WORKS** (DEMO-5
  verdict "blocked", blocked-by DEMO-10 shown). Dashboard loads settings now
  (Project key DEMO saved + persists) but sprint health fails with
  "You must create your route using the 'route' export from '@forge/api'" —
  `jiraGet` passed plain strings to requestJira. **Rovo Chat completely
  unavailable on the site** (no button anywhere, /rovo URLs 404, not in App
  Switcher) — agent picker never opened; review draft + nudge not tested.
- Fix v2.2.0 deployed 23:03 WIB: `jiraGet` now takes route`` templates
  (callers no longer pre-encode; route encodes interpolations). Tests 19/19,
  lint clean, both installs Up-to-date.
- Smoke test #3 IN PROGRESS (started ~23:05 WIB): dashboard health, draft
  review (space TEAM), nudge DEMO-1, Rovo availability check in admin
  (read-only — do not enable anything paid without Eki).
- Smoke test #3 RESULT ~23:08 WIB (v2.2.0): dashboard loads (no route
  error) BUT shows open-work fallback — "No active sprint could be read
  (Authentication Required)": Forge's asUser token gets 401 on
  /rest/agile/1.0 (same call works with Basic auth). Draft review FAILED
  with Confluence 410 (message truncated at "pagesmode"). DEMO-1 panel
  shows "healthy" (updated 1h ago — NOT a bug; nudge button only renders
  when stale, so nudge test needs issues untouched 3+ days, i.e. Nov 20+,
  or threshold 1 on Nov 19). Admin: 0 agents, Rovo "available for all
  apps", beta ON, 0 credits — no Rovo Chat toggle anywhere.
- Fix v2.3.0 deployed ~23:12 WIB: sprint read rewritten to JQL
  (`sprint in openSprints()` + customfield_10020; `sprint = <id>` for
  issues) — Agile API no longer used. Tests 19/19, lint clean.
- Smoke test #4 RESULT ~23:13 WIB (v2.3.0): dashboard FIXED — "Sprint 12
  — active", 2/12 done, 14 days left. Draft STILL 410; full error from
  forge logs: `pagesmodes.GoneException: This deprecated endpoint has been
  removed` — v1 POST /rest/api/content is REMOVED for Forge OAuth tokens
  (identical payload still succeeds via Basic auth — verified twice).
- Fix v3.0.0 deployed ~23:17 WIB: Confluence migrated to v2 API (POST
  /wiki/api/v2/pages + space-key lookup; new scopes write:page:confluence
  + read:space:confluence; deploy needed `--approve MAJOR_VERSION_RULE`;
  upgrades needed `--confirm-scopes --non-interactive` — plain
  --upgrade fails "Prompts can not be meaningfully rendered" non-TTY).
  Both installs v3 Up-to-date.
- Smoke test #5 RESULT ~23:19 WIB (v3.0.0): ALL PASS. Dashboard Sprint 12
  active; draft review CREATED "Sprint review — Sprint 12 — 2026-11-17"
  (verified in Confluence, full content).
- ROVO PATH FOUND (community threads, same symptoms): the main site will
  likely never get Rovo Chat — test on a Forge DEMO SITE instead
  (enterprise Jira/Confluence/Rovo, 1 per developer, 90 days).
  Provisioned 2026-11-17 ~23:18 WIB: **one-atlas-bkwu.atlassian.net**
  (active, expires 2027-02-15). App v3.0.0 installed there (Jira
  184f78fe, Confluence 74346408). Seeded via
  `scripts/seed-demo-site.mjs` (~23:22 WIB): project DEMO, board 179,
  Sprint 12 (id 5207) ACTIVE to Dec 1, 12 issues mirrored, DEMO-10
  blocks DEMO-5, Confluence space TEAM. NOTE: sprint-start PUT requires
  `name` in the body (400 without it) — fixed in the script.
- Rovo test on demo site IN PROGRESS ~23:24 WIB (browser): team creation
  + dashboard + agent picker + 4 conversation starters + nudge ask.
- Rovo test RESULT ~23:30 WIB (demo site, 7 min): ALL PASS. Demo Team
  created (1 member); dashboard Sprint 12 active on-track; Rovo Chat
  found the Sprint Scout agent (two identical cards in recommendations);
  all 4 starters answered correctly (health on-track, blocked, overloaded
  eqiverse 10 items, draft review via confirm card -> Confluence page
  3440642 verified); nudge correctly reported 0 stale.
- **BUG FOUND 2026-11-17 ~23:32 WIB (from the Rovo test): findBlocked
  in src/lib/health.js is INVERTED.** It checks `link.inwardIssue`,
  which Jira returns when the queried issue is the OUTWARD (blocking)
  side — so it reports the blocker as blocked. Correct check is
  `link.outwardIssue` (present when the issue is the inward, blocked
  side). Evidence: main-site DEMO-5 link is {outward: DEMO-5, inward:
  DEMO-10} (Jira truth: DEMO-5 blocks DEMO-10) yet the app shows
  "DEMO-5 blocked by DEMO-10"; demo-site link is the opposite and the
  app shows the opposite. FIX PLAN (v3.0.1, AFTER the GTA6 quiet window
  — do NOT run a fix subagent during a make.fun recording): swap to
  outwardIssue in findBlocked, update the tests that encode the inverted
  behavior, redeploy, then FLIP the main-site link (delete + recreate as
  {outward: DEMO-10, inward: DEMO-5}) so the demo story stays "DEMO-5
  blocked by DEMO-10"; the demo-site link is already that way and needs
  no change. Re-test panel + dashboard + Rovo blocked answer after.
- Fix v3.1.0 deployed 2026-11-18 ~03:11 WIB (Eki's order "selesain aja
  ini"; this is the v3.0.1 fix — Forge numbers it **3.1.0**, minor bump
  for non-scope changes, no patch versions exist): findBlocked now reads
  `outwardIssue` (the blocker on a blocked issue's link entry).
  Tests **20/20** incl. new regression test ("findBlocked never reports
  the blocking side as blocked"); lint clean (forge lint inside deploy:
  "No issues found"; standalone `forge lint` fails with an EPERM chown on
  the CLI config file — sandbox quirk, deploy path unaffected; offline
  lint also clean). All 4 installs Up-to-date (main Jira 92aac7cd, main
  Confluence 61b80c39, demo Jira 184f78fe, demo Confluence 74346408) —
  dev installs auto-track the latest deployment, upgrades reported
  "already at the latest version". Main-site link FLIPPED: old link
  10001 ({outward: DEMO-5, inward: DEMO-10}) deleted (HTTP 204), new
  link 10002 created (HTTP 201) as {outward: DEMO-10, inward: DEMO-5};
  verified via Jira API + the repo's findBlocked run against the LIVE
  payloads: DEMO-5 blocked by DEMO-10 (In Progress), DEMO-10 correctly
  NOT reported blocked. Demo-site link unchanged. STILL TO RE-TEST in
  browser: panel + dashboard + Rovo blocked answer.
- Browser re-test PASSED 2026-11-18 ~03:18 WIB (parent): issue panel
  "Blocked by: DEMO-10 — Set up staging environment autoscaling (In
  Progress)", dashboard "Blocked work (1): DEMO-5 [blocked by DEMO-10]"
  (shows "Sprint Scout · Sprint 12 · v3.1.0"), Rovo on demo site:
  "There is 1 blocked issue in the DEMO project for Sprint 12: DEMO-5
  ... is blocked by DEMO-10." No Jira data changed. The v3.1.0 fix is
  fully verified end to end.
- PRODUCTION DEPLOY done 2026-11-18 ~03:24 WIB (Eki's order "kerjain
  aja langsung sama lo"): tests re-run first — **20/20 pass**.
  `forge deploy -e production --non-interactive --approve
  MAJOR_VERSION_RULE` → SUCCESS, lint "No issues found", 1 approval
  acknowledged. **Production version 2.0.0** (production numbering is
  separate from dev 3.1.0; first production deploy, major bump via the
  approval rule). Confirmed in `forge deploy list`: production major
  version 2, Success, 2026-11-17T20:24:11Z. Deploy note: "new scopes or
  egress URLs detected — run forge install --upgrade" (applies to
  installs, not the deploy). NO installs touched and NO console changes
  — the installation link (Step 5 remainder) is a parent/browser step.
- PUBLIC REPO prep done same run, PUSH BLOCKED: secret scan CLEAN (no
  .env/credential/key files; seed script takes its token from the
  ATLASSIAN_API_TOKEN env var only; the 173 "token" hits in
  package-lock.json are all the @atlaskit/tokens package name). `git
  init -b main`, identity arefki
  <88595682+arefki@users.noreply.github.com>, commit **d18fde9**
  "Sprint Scout v3.1.0 — Codegeist 2026" (22 files, node_modules
  excluded by .gitignore), working tree clean. BLOCKER: `gh auth
  status` → "You are not logged into any GitHub hosts" — the GitHub
  connector is MCP-based and gives gh no auth, so repo
  arefki/sprint-scout could NOT be created and NOTHING was pushed (no
  other push means used, per task rules). Unblock: interactive `gh auth
  login` (parent/browser or Eki), then `gh repo create arefki/sprint-
  scout --public --source=. --push` (or create + push the existing
  local main branch).

- Step 5 DONE 2026-11-18 ~03:31 WIB (Eki's order "kerjain aja langsung"):
  production deploy v2.0.0 (first production deploy; numbering separate
  from dev 3.1.0) + Distribution "Sharing with anyone" (public, NOT
  org-only) with app details (Company eqiverse, support = GitHub repo URL,
  privacy policy = repo PRIVACY.md, Terms blank, personal-data "No").
  Installation link saved in docs/INSTALL-LINK.md + DEVPOST-DRAFT.md.
  Public repo arefki/sprint-scout created via browser (API create failed
  403 — App cannot create repos; gh CLI not authed) and pushed via the
  GitHub connector snapshot push (23 files incl. PRIVACY.md, commit
  aa4933a4, blob SHAs verified identical; provider added an "Initial
  commit" 7e29938e first). App installation on the repo needed Eki's tap
  on the install link (done 03:29 WIB). Category "Apps for Software
  Teams" lives only on Devpost — no Category field exists in the console.
  NEXT: Step 6 demo video (stale/nudge segments need 3-day-old issues,
  i.e. Nov 20+, or staleDays=1 on Nov 19), then Step 7 Devpost submit.

- Fix v3.2.0 deployed 2026-11-18 ~03:52 WIB (duplicate-title bug, found
  during the Step 6 demo recording): a second review draft on the same UTC
  day ALWAYS failed — draftSprintReview built a fixed title ("Sprint review
  — Sprint 12 — 2026-11-17") and the Rovo agent's title suggestions were
  never passed through, so all 6 attempts in the demo session hit the same
  existing page (forge logs 20:37–20:45Z, six identical Confluence 400
  "A page with this title already exists"). Fix: draftSprintReview now
  takes an optional title override (Rovo `title` input — NEW optional
  input on the sprint-review-draft action in manifest.yml — threaded
  through src/index.js; dashboard resolver passes req.payload.title too;
  prompt.md tells the agent it may suggest a title) and createReviewPage
  retries collisions with numbered suffixes " (2)" … " (5)" (max 5
  attempts, then a clear error naming the collision). Only the exact
  duplicate-title 400 retries — 403/500 errors throw immediately.
  Tests **31/31** (20 existing + 11 new in test/service.test.js, mocked
  createPage, no live calls), lint clean (offline + forge lint in deploy).
  Deployed to development as **3.2.0** (2026-11-17T20:52:05Z, Success);
  production stays 2.0.0 until the fix is verified live. No new errors in
  forge logs after the deploy (the six 400s above are pre-fix). STILL TO
  VERIFY LIVE: ask Rovo for a second draft on the demo site — it must now
  create "… — 2026-11-17 (2)" (or today's date) with the CORRECT blocked
  direction (DEMO-5 blocked by DEMO-10); the existing page 3440642 is
  stale (created pre-v3.1.0 with the inverted blocked list). Then re-do
  the Step 6 draft-review video segment.

## 1. Accounts (one-time, ~20 min)

- [ ] **Atlassian account** (free): sign up at id.atlassian.com with
      eqiverse@gmail.com if there isn't one already.
- [ ] **Jira Cloud site**: create a site (e.g. `eqiverse.atlassian.net`).
      Start a **Standard or Premium trial** on it — Rovo is paid-only and
      the trial includes it. Eki must be an **org admin** (needed to install
      apps with Teamwork Graph scopes).
- [ ] **Devpost account** (free): devpost.com, then join Codegeist 2026 at
      codegeist2026.devpost.com (NOT codegeist.devpost.com — that's 2024).
- [ ] **Confluence** on the same site (comes with the trial) + one space
      (note its key, e.g. `TEAM`) for review drafts.
- [ ] Optional: a public GitHub repo `arefki/sprint-scout` with this code
      (judges like source links; the Devpost draft has a slot for it).

## 2. Register the Forge app + first deploy (~30 min)

Run in `~/workspace/codegeist-2026/` on a machine with Node 22.23.4+:

- [ ] `npm install -g @forge/cli` (15.1.0) — then `forge login` (browser).
- [ ] `forge create` in an EMPTY folder, pick any Jira template. This
      registers the app and writes the real `app.id` into a fresh manifest.
- [ ] Copy the generated `app.id` line into this repo's `manifest.yml`,
      replacing the placeholder `ari:cloud:ecosystem::app/fbc81614-...`.
      (Or copy this repo's files over the fresh scaffold, keeping its
      manifest's `app.id`.)
- [ ] In this repo: `npm install`, `npm test` (expect 19 passing),
      `npx forge lint` (expect clean).
- [ ] `forge deploy -e development`
- [ ] `forge install -e development --site <your-site>.atlassian.net --product jira`
      — approve the 12 scopes when asked (org admin).

## 3. Seed demo data on the Jira site (~20 min, can be days before recording)

- [ ] A project (e.g. `DEMO`) with an **active sprint** (~10 issues across
      To Do / In Progress / Done).
- [ ] 2–3 issues untouched for 3+ days (create them early, or just accept
      whatever is stale by recording day).
- [ ] 1 issue linked "is blocked by" another open issue.
- [ ] An Atlassian team with 2–3 members who have assigned work (for the
      workload question). One member with 9+ open items shows the overload
      flag nicely.

## 4. Smoke test (the moment of truth — code is untested on a live site)

- [ ] Dashboard: Apps → Sprint Scout → save project key → Refresh health.
      Expect: sprint name, counts, stale/blocked lists.
- [ ] Issue panel: open an issue → ••• → Sprint Scout. Expect a verdict.
- [ ] Rovo agent: open a work item → Open Rovo Chat → Change agent →
      **Browse agents** → Sprint Scout (the small search box may not list
      dev agents). Ask all 4 conversation starters.
- [ ] Review draft: ask for one in your Confluence space; check the page.
- [ ] Nudge: ask it to nudge stale ones; check one issue's comments.
- [ ] Check logs for errors: `forge logs -e development`.
- [ ] If something fails: fix code → `forge deploy -e development` →
      `forge install ... --upgrade` (scope changes need admin re-consent).

## 5. Production deploy + installation link (~15 min)

- [x] `forge deploy -e production` — DONE 2026-11-18 ~03:24 WIB,
      production version **2.0.0** (see progress log).
- [ ] Developer console (developer.atlassian.com/console) → app →
      Distribution → Edit → **Sharing** (NOT "Sharing within organization")
      → fill in app details → save → choose Jira → copy the **installation
      link**. This is what judges install from.
- [ ] Sanity-check the link in a second browser profile if possible.

## 6. Demo video (~1–2 h incl. recording)

- [ ] Follow [`docs/DEMO-SCRIPT.md`](DEMO-SCRIPT.md) (4:00–4:30 target).
- [ ] Upload to YouTube as **Public** (not unlisted), copy the URL.

## 7. Submit on Devpost (~20 min)

- [ ] Fill the form from [`docs/DEVPOST-DRAFT.md`](DEVPOST-DRAFT.md):
      description, installation link, YouTube URL, repo URL, category
      (Apps for Software Teams), bonuses (Best Agents, Best MCP, Best
      Teamwork Graph).
- [ ] Submit before **Wed 23 Dec 2026, 03:00 WIB**. Don't leave it to the
      last hour — Devpost + YouTube processing can be slow.

## 8. After submitting

- [ ] Keep the trial site / installation link alive until judging ends
      (~3 Feb 2027) — judges install from the link.
- [ ] If we win anything, Eki personally completes the affidavit + W-8BEN +
      bank details within 10 business days of notification.
