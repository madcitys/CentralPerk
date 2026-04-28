import { createApiHandler } from "./route-utils";
import { loadLocalPointsSnapshot } from "./local-points";

export const localRuntimePointsHandler = createApiHandler({
  route: "/api/local-runtime/points",
  methods: ["GET"] as const,
  rateLimit: { limit: 120, windowMs: 60_000 },
  handler: async () => ({
    ok: true as const,
    snapshot: await loadLocalPointsSnapshot(),
  }),
});
