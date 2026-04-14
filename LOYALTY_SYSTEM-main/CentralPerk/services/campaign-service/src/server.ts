import Fastify from "fastify";
import { z } from "zod";
import { config } from "./config.js";
import {
  assignMemberVariant,
  getActive,
  getCampaigns,
  lookupActiveMultiplier,
  queueCampaignNotifications,
  loadPerformance,
  saveCampaign,
} from "./engine.js";

export function createServer() {
  const fastify = Fastify({ logger: true });

const campaignSchema = z.object({
  id: z.string().uuid().optional(),
  campaignCode: z.string().trim().min(1).max(80),
  campaignName: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  campaignType: z.enum(["bonus_points", "flash_sale", "multiplier_event"]),
  status: z.enum(["draft", "scheduled", "active", "paused", "completed", "archived"]).optional(),
  multiplier: z.number().min(0).max(100).optional(),
  minimumPurchaseAmount: z.number().min(0).max(10_000_000).optional(),
  bonusPoints: z.number().int().min(0).max(1_000_000).optional(),
  productScope: z.array(z.string()).optional(),
  eligibleTiers: z.array(z.string()).optional(),
  rewardId: z.union([z.string(), z.number()]).nullable().optional(),
  flashSaleQuantityLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  budgetLimit: z.number().min(0).nullable().optional(),
  autoPause: z.boolean().optional(),
});

const multiplierSchema = z.object({
  memberIdentifier: z.string().trim().min(1).max(120),
  fallbackEmail: z.string().email().optional(),
  tier: z.string().optional(),
  amountSpent: z.number().min(0).max(10_000_000),
});

  fastify.get("/health", async () => ({ ok: true }));

fastify.get("/campaigns", async () => {
  const campaigns = await getCampaigns();
  return { ok: true, campaigns };
});

fastify.get("/campaigns/active", async () => {
  const campaigns = await getActive();
  return { ok: true, campaigns };
});

fastify.post("/campaigns", async (request) => {
  const parsed = campaignSchema.parse(request.body);
  const campaign = await saveCampaign(parsed);
  return { ok: true, campaign };
});

fastify.post("/campaigns/:id/assign", async (request) => {
  const campaignId = String((request.params as any).id || "");
  const body = z
    .object({
      memberIdentifier: z.string().trim().min(1).max(120),
      fallbackEmail: z.string().email().optional(),
    })
    .parse(request.body);
  const assignment = await assignMemberVariant(campaignId, body.memberIdentifier, body.fallbackEmail);
  return { ok: true, assignment };
});

fastify.post("/campaigns/multiplier", async (request) => {
  const parsed = multiplierSchema.parse(request.body);
  const result = await lookupActiveMultiplier(parsed);
  return { ok: true, result };
});

fastify.get("/campaigns/performance", async () => {
  const rows = await loadPerformance();
  return { ok: true, performance: rows };
});

fastify.post("/campaigns/:id/notify", async (request) => {
  const campaignId = String((request.params as any).id || "");
  const queued = await queueCampaignNotifications(campaignId);
  return { ok: true, notificationsQueued: queued };
});

  return fastify;
}

if (import.meta.url === process.argv[1] || import.meta.url === `file://${process.argv[1]}`) {
  const server = createServer();
  server
    .listen({ host: "0.0.0.0", port: config.port })
    .then((address) => {
      server.log.info({ address }, "Campaign service listening");
    })
    .catch((err) => {
      server.log.error(err);
      process.exit(1);
    });
}
