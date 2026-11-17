// Sprint Scout — Jira global page (UI Kit).
//
// A dashboard for the sprint: health summary, stale and blocked work, and
// workload hotspots, plus the saved config (project, Confluence space, stale
// threshold) and a one-click sprint-review draft.
//
// The settings fields are controlled React state (value + onChange) rather
// than a <Form>: in UI Kit 2, Form's onSubmit receives no form-state argument
// (values come from the useForm hook), and controlled inputs keep the async
// config load simple and explicit.

import React, { useEffect, useState } from "react";
import ForgeReconciler, {
  Box,
  Button,
  Heading,
  Inline,
  Label,
  Link,
  Lozenge,
  SectionMessage,
  Stack,
  Text,
  Textfield,
} from "@forge/react";
import { invoke } from "@forge/bridge";

const RISK_LOZENGE = {
  "on-track": "success",
  watch: "inprogress",
  "at-risk": "removed",
  empty: "default",
};

function IssueRow({ item, extra }) {
  return (
    <Box paddingBlock="space.050">
      <Inline space="space.100" alignBlock="center">
        {item.webUrl ? (
          <Link href={item.webUrl} openNewTab>
            {item.key}
          </Link>
        ) : (
          <Text>{item.key}</Text>
        )}
        <Text>
          {item.summary} · {item.status || "—"} · {item.assignee || "Unassigned"}
        </Text>
        {extra ? <Lozenge appearance="removed">{extra}</Lozenge> : null}
      </Inline>
    </Box>
  );
}

function App() {
  const [projectKey, setProjectKey] = useState("");
  const [spaceKey, setSpaceKey] = useState("");
  const [staleDays, setStaleDays] = useState("3");
  const [configLoaded, setConfigLoaded] = useState(false);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [message, setMessage] = useState(null); // { appearance, title, body }
  const [draft, setDraft] = useState(null);

  const refresh = async (key, days) => {
    const pk = (key ?? projectKey).trim().toUpperCase();
    if (!pk) return;
    setLoading(true);
    setMessage(null);
    const res = await invoke("getHealth", { projectKey: pk, staleDays: Number(days ?? staleDays) || 3 });
    setLoading(false);
    if (res.error) {
      setHealth(null);
      setMessage({ appearance: "error", title: "Could not load sprint health", body: res.error });
      return;
    }
    setHealth(res);
  };

  useEffect(() => {
    invoke("getConfig").then((cfg) => {
      setProjectKey(cfg.projectKey || "");
      setSpaceKey(cfg.spaceKey || "");
      setStaleDays(String(cfg.staleDays || 3));
      setConfigLoaded(true);
      if (cfg.projectKey) refresh(cfg.projectKey, cfg.staleDays);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSaveConfig = async () => {
    const pk = projectKey.trim().toUpperCase();
    if (!pk) {
      setMessage({ appearance: "warning", title: "Project key needed", body: "Enter a Jira project key, for example PROJ." });
      return;
    }
    setSaving(true);
    await invoke("setConfig", { projectKey: pk, spaceKey: spaceKey.trim(), staleDays: Number(staleDays) || 3 });
    setSaving(false);
    setMessage({ appearance: "success", title: "Settings saved", body: `Watching project ${pk}.` });
    refresh(pk, staleDays);
  };

  const onDraftReview = async () => {
    const pk = projectKey.trim().toUpperCase();
    const sk = spaceKey.trim().toUpperCase();
    if (!pk || !sk) {
      setMessage({
        appearance: "warning",
        title: "Missing settings",
        body: "Set a project key and a Confluence space key first, then save.",
      });
      return;
    }
    setDrafting(true);
    setDraft(null);
    const res = await invoke("createReviewDraft", { projectKey: pk, spaceKey: sk });
    setDrafting(false);
    if (res.error) {
      setMessage({ appearance: "error", title: "Could not draft the review", body: res.error });
      return;
    }
    setDraft(res);
    setMessage({ appearance: "success", title: "Review drafted", body: `Created “${res.pageTitle}” in Confluence.` });
  };

  return (
    <Box padding="space.400">
      <Stack space="space.300">
        <Heading size="large">Sprint Scout</Heading>
        <Text>How healthy is your sprint, right now? Stale work, blockers and overloaded teammates — in one place.</Text>

        {message ? (
          <SectionMessage appearance={message.appearance} title={message.title}>
            <Text>{message.body}</Text>
          </SectionMessage>
        ) : null}

        <Box padding="space.200" backgroundColor="color.background.neutral">
          <Stack space="space.200">
            <Heading size="medium">Settings</Heading>
            {!configLoaded ? (
              <Text>Loading settings…</Text>
            ) : (
              <>
                <Inline space="space.200">
                  <Stack space="space.050">
                    <Label labelFor="projectKey">Project key</Label>
                    <Textfield
                      id="projectKey"
                      name="projectKey"
                      value={projectKey}
                      onChange={(e) => setProjectKey(e.target.value)}
                      isRequired
                    />
                  </Stack>
                  <Stack space="space.050">
                    <Label labelFor="spaceKey">Confluence space key</Label>
                    <Textfield
                      id="spaceKey"
                      name="spaceKey"
                      value={spaceKey}
                      onChange={(e) => setSpaceKey(e.target.value)}
                    />
                  </Stack>
                  <Stack space="space.050">
                    <Label labelFor="staleDays">Stale after (days)</Label>
                    <Textfield
                      id="staleDays"
                      name="staleDays"
                      value={staleDays}
                      onChange={(e) => setStaleDays(e.target.value)}
                    />
                  </Stack>
                </Inline>
                <Inline space="space.100">
                  <Button appearance="primary" onClick={onSaveConfig} isDisabled={saving}>
                    {saving ? "Saving…" : "Save settings"}
                  </Button>
                  <Button onClick={() => refresh()} isDisabled={loading || !projectKey.trim()}>
                    {loading ? "Refreshing…" : "Refresh health"}
                  </Button>
                  <Button onClick={onDraftReview} isDisabled={drafting || !projectKey.trim() || !spaceKey.trim()}>
                    {drafting ? "Drafting…" : "Draft sprint review in Confluence"}
                  </Button>
                </Inline>
              </>
            )}
          </Stack>
        </Box>

        {draft ? (
          <SectionMessage appearance="success" title="Review page created">
            <Link href={draft.pageUrl} openNewTab>
              {draft.pageTitle}
            </Link>
          </SectionMessage>
        ) : null}

        {health ? (
          <Stack space="space.300">
            <Box>
              <Heading size="medium">
                {health.sprint ? `${health.sprint.name} — ${health.sprint.state}` : `Open work in ${health.projectKey}`}
              </Heading>
              {health.mode === "open-work" ? <Text>No active sprint — showing all open work in the project.</Text> : null}
              <Inline space="space.100" alignBlock="center">
                <Lozenge appearance={RISK_LOZENGE[health.health.risk] || "default"}>{health.health.risk}</Lozenge>
                <Text>{health.health.riskReason}</Text>
              </Inline>
              <Text>
                {health.health.done} of {health.health.total} done ({health.health.donePct}%) · {health.health.inProgress}{" "}
                in progress · {health.health.todo} to do
                {health.health.daysLeft !== null ? ` · ${health.health.daysLeft} day(s) left in the sprint` : ""}
              </Text>
            </Box>

            <Box>
              <Heading size="small">Stale work ({health.totalStale})</Heading>
              {health.stale.length === 0 ? (
                <Text>Nothing stale — everything open was touched recently.</Text>
              ) : (
                health.stale.map((s) => <IssueRow key={s.key} item={s} extra={`${s.daysStale}d idle`} />)
              )}
            </Box>

            <Box>
              <Heading size="small">Blocked work ({health.totalBlocked})</Heading>
              {health.blocked.length === 0 ? (
                <Text>Nothing blocked.</Text>
              ) : (
                health.blocked.map((b) => (
                  <IssueRow key={b.key} item={b} extra={`blocked by ${b.blockedBy.map((x) => x.key).join(", ")}`} />
                ))
              )}
            </Box>

            <Box>
              <Heading size="small">Workload hotspots</Heading>
              {health.workload.overloaded.length === 0 ? (
                <Text>No one is carrying more than 8 open items.</Text>
              ) : (
                health.workload.overloaded.map((m) => (
                  <Text key={m.name}>
                    {m.name}: {m.openCount} open items ({m.keys.join(", ")})
                  </Text>
                ))
              )}
              {health.workload.unassignedOpen > 0 ? (
                <Text>{health.workload.unassignedOpen} open item(s) have no assignee.</Text>
              ) : null}
            </Box>

            {health.notes && health.notes.length > 0 ? (
              <SectionMessage appearance="information" title="Notes">
                {health.notes.map((n, i) => (
                  <Text key={i}>{n}</Text>
                ))}
              </SectionMessage>
            ) : null}
          </Stack>
        ) : (
          !loading && <Text>Save a project key above to see its sprint health.</Text>
        )}
      </Stack>
    </Box>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
