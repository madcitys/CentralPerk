import { createApiHandler } from "./route-utils";

function resolveGatewayBaseUrl() {
  return String(
    process.env.GATEWAY_URL ||
      process.env.NEXT_PUBLIC_GATEWAY_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      "http://127.0.0.1:4000",
  ).replace(/\/+$/, "");
}

async function probe(path: string) {
  const startedAt = Date.now();
  const url = `${resolveGatewayBaseUrl()}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    return {
      path,
      ok: response.ok,
      status: response.status,
      responseTimeMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      path,
      ok: false,
      status: 503,
      responseTimeMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Probe failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export const analyticsProgramHealthHandler = createApiHandler({
  route: "/api/analytics/program-health",
  methods: ["GET"] as const,
  rateLimit: { limit: 60, windowMs: 60_000 },
  handler: async () => {
    const checks = await Promise.all([
      probe("/health"),
      probe("/points/health"),
      probe("/campaigns/health"),
      probe("/members/health"),
      probe("/segments/health"),
      probe("/notifications/health"),
      probe("/rewards/health"),
    ]);
    const healthyChecks = checks.filter((check) => check.ok).length;

    return {
      ok: true as const,
      status: healthyChecks === checks.length ? "healthy" : healthyChecks > 0 ? "degraded" : "down",
      checkedAt: new Date().toISOString(),
      summary: {
        totalChecks: checks.length,
        healthyChecks,
        unhealthyChecks: checks.length - healthyChecks,
      },
      checks,
    };
  },
});
