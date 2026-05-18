import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = (process.env.CENTRALPERK_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");

async function fetchText(path, init) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      accept: "text/html,application/json",
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  assert.equal(response.ok, true, `${path} returned ${response.status}: ${text.slice(0, 300)}`);
  return { response, text };
}

async function fetchJson(path, init) {
  const { response, text } = await fetchText(path, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    assert.fail(`${path} did not return JSON: ${text.slice(0, 300)}`);
  }
  return { response, payload };
}

function staticAssetsFromHtml(html) {
  return [...html.matchAll(/\/_next\/static\/[^"']+/g)].map((match) => match[0]);
}

test("browser flow: login, customer pages, admin pages, and service APIs stay reachable", async () => {
  const pages = [
    "/login",
    "/customer",
    "/customer/rewards",
    "/customer/earn",
    "/customer/engagement",
    "/admin",
    "/admin/members",
    "/admin/rewards",
  ];

  let loginHtml = "";
  for (const page of pages) {
    const { text } = await fetchText(page);
    assert.match(text, /__NEXT_DATA__|centralperk-runtime-config|<div id="root"/i, `${page} did not look like an app page`);
    if (page === "/login") loginHtml = text;
  }

  const assets = [...new Set(staticAssetsFromHtml(loginHtml))];
  assert.equal(assets.length > 0, true, "login page did not include Next static assets");
  for (const asset of assets) {
    const assetResponse = await fetch(`${baseUrl}${asset}`);
    assert.equal(assetResponse.ok, true, `${asset} returned ${assetResponse.status}`);
  }

  await fetchJson("/api/health");
  const members = await fetchJson("/api/admin/members");
  const firstMember = Array.isArray(members.payload.members) ? members.payload.members[0] : null;

  await fetchJson("/api/points/ledger?limit=5");
  await fetchJson("/api/points/tiers");
  await fetchJson("/api/rewards");
  await fetchJson("/api/reward-partners/performance");
  await fetchJson("/api/engagement/challenges");
  await fetchJson("/api/engagement/surveys");

  if (firstMember?.memberNumber) {
    await fetchJson(`/api/engagement/settings/${encodeURIComponent(firstMember.memberNumber)}`);
    await fetchJson(`/api/points/activity?memberIdentifier=${encodeURIComponent(firstMember.memberNumber)}&limit=5`);
  }
});
