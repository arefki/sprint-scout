// Sprint Scout — Jira issue panel (UI Kit).
//
// Shows a one-glance verdict for the work item on screen: is it stale,
// blocked, or healthy — and offers a one-click nudge to the assignee when
// it has gone quiet.

import React, { useEffect, useState } from "react";
import ForgeReconciler, {
  Box,
  Button,
  Heading,
  Inline,
  Lozenge,
  SectionMessage,
  Stack,
  Text,
  useProductContext,
} from "@forge/react";
import { invoke } from "@forge/bridge";

function App() {
  const context = useProductContext();
  const issueKey = context?.extension?.issue?.key;
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nudging, setNudging] = useState(false);
  const [message, setMessage] = useState(null); // { appearance, title, body }

  useEffect(() => {
    if (!issueKey) return;
    setLoading(true);
    invoke("getConfig")
      .then((cfg) => invoke("getIssueInsight", { issueKey, staleDays: cfg.staleDays }))
      .then((res) => {
        setLoading(false);
        if (res.error) {
          setMessage({ appearance: "error", title: "Could not load insight", body: res.error });
          return;
        }
        setInsight(res);
      });
  }, [issueKey]);

  const onNudge = async () => {
    setNudging(true);
    const res = await invoke("nudgeThisIssue", { issueKey });
    setNudging(false);
    if (res.error) {
      setMessage({ appearance: "error", title: "Could not send the nudge", body: res.error });
      return;
    }
    setMessage({
      appearance: "success",
      title: "Nudge sent",
      body: `Posted a status-request comment for ${res.assignee || "the assignee"}.`,
    });
  };

  if (!issueKey) {
    return (
      <Box padding="space.200">
        <Text>Open a work item to see its Sprint Scout insight.</Text>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box padding="space.200">
        <Text>Checking this work item…</Text>
      </Box>
    );
  }

  if (!insight) {
    return (
      <Box padding="space.200">
        {message ? (
          <SectionMessage appearance={message.appearance} title={message.title}>
            <Text>{message.body}</Text>
          </SectionMessage>
        ) : null}
      </Box>
    );
  }

  const verdict = insight.done ? "done" : insight.stale ? "stale" : insight.blockedBy.length > 0 ? "blocked" : "healthy";
  const verdictLozenge = { done: "success", stale: "removed", blocked: "inprogress", healthy: "success" }[verdict];

  return (
    <Box padding="space.200">
      <Stack space="space.200">
        <Inline space="space.100" alignBlock="center">
          <Heading size="small">Sprint Scout</Heading>
          <Lozenge appearance={verdictLozenge}>{verdict}</Lozenge>
        </Inline>

        <Text>
          {insight.status || "—"} · last updated{" "}
          {insight.daysSinceUpdate === null ? "unknown" : `${insight.daysSinceUpdate} day(s) ago`} ·{" "}
          {insight.commentCount} comment(s) · assignee {insight.assignee || "none"} · reporter{" "}
          {insight.reporter || "unknown"}
        </Text>

        {insight.stale ? (
          <SectionMessage appearance="warning" title="This work item has gone stale">
            <Text>
              No update in {insight.daysSinceUpdate} day(s). A quick status check from the assignee would help the team
              plan.
            </Text>
          </SectionMessage>
        ) : null}

        {insight.blockedBy.length > 0 ? (
          <Box>
            <Text>Blocked by:</Text>
            {insight.blockedBy.map((b) => (
              <Text key={b.key}>
                {b.key} — {b.summary} ({b.status || "—"})
              </Text>
            ))}
          </Box>
        ) : null}

        {insight.stale && insight.assignee ? (
          <Button appearance="primary" onClick={onNudge} isDisabled={nudging}>
            {nudging ? "Sending…" : `Nudge ${insight.assignee}`}
          </Button>
        ) : null}

        {message ? (
          <SectionMessage appearance={message.appearance} title={message.title}>
            <Text>{message.body}</Text>
          </SectionMessage>
        ) : null}

        <Text>
          See the whole sprint picture on the Sprint Scout page (Apps menu in Jira) — or ask the Sprint Scout agent in
          Rovo chat.
        </Text>
      </Stack>
    </Box>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
