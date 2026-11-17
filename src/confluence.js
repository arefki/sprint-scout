// Confluence helpers for Sprint Scout. Page creation runs as the user
// (asUser), so the review page is authored by the person who asked for it and
// respects what they can see.
//
// Uses the Confluence REST API **v2** (POST /wiki/api/v2/pages). The v1
// POST /wiki/rest/api/content endpoint is REMOVED for Forge OAuth tokens —
// verified 2026-11-17, it answers 410 GoneException ("This deprecated
// endpoint has been removed") to the app's asUser call, even though the
// identical payload still succeeds with Basic auth. Do NOT switch this back
// to v1. Scopes: write:page:confluence (create) + read:space:confluence
// (resolve a space key to its v2 space id).

import { asUser, route } from "@forge/api";

// Resolve a space key (e.g. TEAM) to its v2 space id.
async function getSpaceId(spaceKey) {
  const res = await asUser().requestConfluence(route`/wiki/api/v2/spaces?keys=${spaceKey}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`getSpaceId failed (${res.status}): ${body.slice(0, 500)}`);
    throw new Error(`Could not find Confluence space ${spaceKey} (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const space = (data.results || [])[0];
  if (!space) throw new Error(`Confluence space ${spaceKey} does not exist or you cannot see it.`);
  return space.id;
}

// Create a page in `spaceKey` with `title` and storage-format HTML body.
// Returns { id, title, url } or throws.
export async function createPage(spaceKey, title, storageHtml) {
  const spaceId = await getSpaceId(spaceKey);
  const res = await asUser().requestConfluence(route`/wiki/api/v2/pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      spaceId,
      status: "current",
      title,
      body: { representation: "storage", value: storageHtml },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Log the FULL body: the UI only ever shows the first 200 chars.
    console.error(`createPage failed (${res.status}): ${body.slice(0, 1000)}`);
    throw new Error(`Could not create the Confluence page (${res.status}): ${body.slice(0, 200)}`);
  }
  const page = await res.json();
  return { id: page.id, title: page.title, url: page._links?.base + page._links?.webui };
}
