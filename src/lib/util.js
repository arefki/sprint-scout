// Pure helpers for Sprint Scout — no Forge imports, so this file is fully
// unit-testable with plain node:test (see test/).

// ---- Statuses ------------------------------------------------------------

// Status names that mean "finished" on a default Jira workflow. Sites with
// custom workflows or another language may use other names; the health
// summary also checks the status *category* ("Done") when it is available,
// which is workflow-independent.
export const DONE_STATUS_NAMES = /^(done|closed|resolved)$/i;

export function isDoneStatus(status) {
  if (!status) return false;
  if (status.statusCategory?.key === "done") return true;
  return DONE_STATUS_NAMES.test(status.name || "");
}

export function isInProgressStatus(status) {
  if (!status) return false;
  if (status.statusCategory?.key === "indeterminate") return true;
  return /^(in progress|in review|doing|in development)$/i.test(status.name || "");
}

// ---- Dates ---------------------------------------------------------------

export function daysSince(isoDate, now = new Date()) {
  const t = Date.parse(isoDate);
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

export function daysUntil(isoDate, now = new Date()) {
  const t = Date.parse(isoDate);
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now.getTime()) / 86_400_000);
}

// ---- Teamwork Graph ARIs -------------------------------------------------

// Ids in the graph are ARIs. A user is ari:cloud:identity::user/<accountId>;
// a Jira work item is ari:cloud:jira:<cloudId>:issue/<numeric issue id>
// (the key will not do — the numeric id comes from the Jira REST response).
export const userAri = (accountId) => `ari:cloud:identity::user/${accountId}`;

export const workItemAri = (cloudId, issueId) =>
  `ari:cloud:jira:${cloudId}:issue/${issueId}`;

// ---- JQL -----------------------------------------------------------------

// Fallback query used when a project has no active sprint: everything still
// open, stalest first. `projectKey` is upper-cased and validated by the
// caller; JQL string values are never interpolated from free user text.
export function openWorkJql(projectKey) {
  return `project = ${projectKey} AND statusCategory != Done ORDER BY updated ASC`;
}

// ---- Project keys --------------------------------------------------------

export function normaliseProjectKey(raw) {
  const key = String(raw || "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{0,9}$/.test(key)) return null;
  return key;
}

// The project of the work item open on screen, e.g. "PROJ" from "PROJ-123".
export function projectKeyFromIssueKey(issueKey) {
  const key = String(issueKey || "").trim().toUpperCase();
  const m = /^([A-Z][A-Z0-9]{0,9})-\d+$/.exec(key);
  return m ? m[1] : null;
}

// ---- Small utilities -----------------------------------------------------

export function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
