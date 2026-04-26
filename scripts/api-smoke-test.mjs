const baseUrl = process.env.API_BASE_URL || "http://localhost:4000";
const checks = [
  { name: "health", path: "/health" },
  { name: "members", path: "/members" },
  { name: "segments", path: "/segments" },
  { name: "campaigns", path: "/campaigns" },
  { name: "rewards", path: "/rewards" },
  { name: "notifications", path: "/notifications?limit=20" },
  { name: "memberNotifications", path: "/members/MEM-000011/notifications?limit=20" },
  { name: "tiers", path: "/tiers/rules" },
  { name: "partnersDashboard", path: "/partners/dashboard" },
  { name: "communicationsAnalytics", path: "/communications/analytics" },
];

let failed = false;

for (const check of checks) {
  const url = `${baseUrl}${check.path}`;
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
    });
    const elapsedMs = Math.round(performance.now() - startedAt);

    if (!response.ok) {
      failed = true;
      console.error(`[api-smoke] ${check.name} failed (${response.status}) ${url}`);
      continue;
    }

    await response.json().catch(() => ({}));

    if (elapsedMs > 2000) {
      failed = true;
      console.error(`[api-smoke] ${check.name} exceeded 2000ms (${elapsedMs}ms) ${url}`);
      continue;
    }

    console.log(`[api-smoke] ${check.name} ok (${elapsedMs}ms) ${url}`);
  } catch (error) {
    failed = true;
    console.error(
      `[api-smoke] ${check.name} unreachable ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

if (failed) {
  process.exitCode = 1;
}
