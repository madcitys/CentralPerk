import Fastify from "fastify";
import { z } from "zod";
import { awardPoints, redeemPoints, runExpiry } from "./core/engine.js";
import { supabaseRepo } from "./supabase-repo.js";
import { checkIdempotency, storeIdempotency } from "./idempotency.js";
import { config } from "./config.js";

const fastify = Fastify({
  logger: true,
});

const awardSchema = z.object({
  memberIdentifier: z.string().trim().min(1).max(120),
  fallbackEmail: z.string().email().optional(),
  points: z.number().int().min(0).max(1_000_000),
  transactionType: z.enum(["PURCHASE", "MANUAL_AWARD", "EARN"]),
  reason: z.string().trim().min(1).max(240),
  amountSpent: z.number().min(0).max(10_000_000).optional(),
  productCode: z.string().trim().max(80).optional(),
  productCategory: z.string().trim().max(80).optional(),
});

const redeemSchema = z.object({
  memberIdentifier: z.string().trim().min(1).max(120),
  fallbackEmail: z.string().email().optional(),
  points: z.number().int().min(1).max(1_000_000),
  reason: z.string().trim().min(1).max(240),
  transactionType: z.enum(["REDEEM", "GIFT"]).optional(),
  rewardCatalogId: z
    .union([z.string().trim().max(80), z.number().int()])
    .nullable()
    .optional()
    .transform((v) => (v === null ? undefined : v)),
  promotionCampaignId: z.string().trim().max(80).nullable().optional(),
});

fastify.post("/points/award", async (request, reply) => {
  const parsed = awardSchema.parse(request.body);
  const idempotencyKey = request.headers["idempotency-key"] as string | undefined;

  if (idempotencyKey) {
    const existing = await checkIdempotency("/points/award", idempotencyKey, parsed);
    if (existing) return existing.response;
  }

  const result = await awardPoints(supabaseRepo, parsed);
  const response = { ok: true, result };

  if (idempotencyKey) {
    await storeIdempotency("/points/award", idempotencyKey, parsed, response);
  }

  return response;
});

fastify.post("/points/redeem", async (request, reply) => {
  const parsed = redeemSchema.parse(request.body);
  const idempotencyKey = request.headers["idempotency-key"] as string | undefined;

  if (idempotencyKey) {
    const existing = await checkIdempotency("/points/redeem", idempotencyKey, parsed);
    if (existing) return existing.response;
  }

  const normalized = { ...parsed, rewardCatalogId: parsed.rewardCatalogId ?? undefined };
  const result = await redeemPoints(supabaseRepo, normalized);
  const response = { ok: true, result };

  if (idempotencyKey) {
    await storeIdempotency("/points/redeem", idempotencyKey, parsed, response);
  }

  return response;
});

fastify.post("/points/expiry/run", async () => {
  const result = await runExpiry(supabaseRepo);
  return { ok: true, result };
});

fastify.get("/points/tiers", async () => {
  const rules = await supabaseRepo.fetchTierRules();
  return { ok: true, tiers: rules };
});

fastify.get("/health", async () => ({ ok: true }));

fastify.listen({ host: "0.0.0.0", port: config.port }).catch((err) => {
  fastify.log.error(err);
  process.exit(1);
});
