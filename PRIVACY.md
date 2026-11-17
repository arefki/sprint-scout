# Privacy Policy — Sprint Scout

Last updated: 18 November 2026.

Sprint Scout is a Forge app that runs entirely inside Atlassian Cloud. It
has no external servers, no analytics, no tracking, and no advertising.

## What the app reads

Sprint Scout reads Jira and Confluence data only through the signed-in
user's own permissions (it runs "as the user"). It reads:

- Jira issues, sprints, and issue links in projects the user can already see;
- Atlassian team membership and assigned work items, for the workload view;
- Confluence spaces, only when the user asks the app to draft a sprint
  review there.

## What the app stores

- Dashboard settings the user saves (project key, Confluence space key,
  stale threshold) are stored in Atlassian Forge storage on the user's own
  site.
- The app does **not** store personal data outside Atlassian, does not send
  data to any third party, and does not keep copies of issue content after
  the request finishes.

## What the app writes

Only when the user confirms first: a sprint-review draft page in Confluence,
and polite status-request comments on stale Jira issues. Both actions are
performed as the user, on the user's own site.

## Contact

Questions or issues: open an issue at
https://github.com/arefki/sprint-scout/issues.
