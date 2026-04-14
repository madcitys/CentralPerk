import { createApiHandler } from "../../server/route-utils";

export default createApiHandler({
  route: "/api/health",
  methods: ["GET"] as const,
  rateLimit: { limit: 120, windowMs: 60_000 },
  handler: async () => ({
    ok: true,
    status: "healthy",
    timestamp: new Date().toISOString(),
  }),
});
