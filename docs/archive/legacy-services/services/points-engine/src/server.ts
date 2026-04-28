import Fastify from "fastify";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { awardPoints, redeemPoints, runExpiry } from "./core/engine.js";
import { supabaseRepo } from "./supabase-repo.js";
import { checkIdempotency, storeIdempotency } from "./idempotency.js";
import { config } from "./config.js";
import { memoryRepo } from "./memory-repo.js";

function canUseLocalFallback(error: unknown) {
  const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
  return (
    process.env.USE_LOCAL_LOYALTY_API === "true" ||
    process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true" ||
    !config.supabaseUrl ||
    !config.supabaseServiceKey ||
    message.includes("invalid api key") ||
    message.includes("fetch failed") ||
    message.includes("failed to fetch") ||
    message.includes("network")
  );
}

function useMemoryPrimary() {
  return config.useLocalFallback || !config.supabaseUrl || !config.supabaseServiceKey;
}

export function createServer() {
const fastify = Fastify({
  logger: true,
});

fastify.setErrorHandler((error, _request, reply) => {
  const message = String(error.message || "Unexpected points service error.");
  const lowerMessage = message.toLowerCase();
  const statusCode = Number((error as Error & { statusCode?: number }).statusCode || 500);

  if (error instanceof z.ZodError) {
    reply.code(400).send({ ok: false, error: "Validation failed.", details: error.flatten() });
    return;
  }

  if (lowerMessage.includes("not enough points") || lowerMessage.includes("insufficient")) {
    reply.code(409).send({ ok: false, code: "INSUFFICIENT_POINTS", error: "Insufficient points balance." });
    return;
  }

  if (lowerMessage.includes("member not found")) {
    reply.code(404).send({ ok: false, code: "MEMBER_NOT_FOUND", error: "Member not found." });
    return;
  }

  if (statusCode === 409) {
    reply.code(409).send({ ok: false, code: (error as Error & { code?: string }).code || "CONFLICT", error: message });
    return;
  }

  reply.code(statusCode >= 400 && statusCode < 600 ? statusCode : 500).send({ ok: false, error: message });
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

fastify.post("/points/award", async (request) => {
  const parsed = awardSchema.parse(request.body);
  const idempotencyKey = request.headers["idempotency-key"] as string | undefined;
  const repo = useMemoryPrimary() ? memoryRepo : supabaseRepo;

  if (idempotencyKey) {
    const existing = await checkIdempotency("/points/award", idempotencyKey, parsed);
    if (existing) return existing.response;
  }

  const result = await awardPoints(repo, parsed).catch((error) => {
    if (repo === memoryRepo || !canUseLocalFallback(error)) throw error;
    request.log.warn({ err: error }, "Using local points fallback for award.");
    return awardPoints(memoryRepo, parsed);
  });
  const response = { ok: true, result };

  if (idempotencyKey) {
    await storeIdempotency("/points/award", idempotencyKey, parsed, response);
  }

  return response;
});

fastify.post("/points/redeem", async (request) => {
  const parsed = redeemSchema.parse(request.body);
  const idempotencyKey = request.headers["idempotency-key"] as string | undefined;
  const repo = useMemoryPrimary() ? memoryRepo : supabaseRepo;

  if (idempotencyKey) {
    const existing = await checkIdempotency("/points/redeem", idempotencyKey, parsed);
    if (existing) return existing.response;
  }

  const normalized = { ...parsed, rewardCatalogId: parsed.rewardCatalogId ?? undefined };
  const result = await redeemPoints(repo, normalized).catch((error) => {
    if (repo === memoryRepo || !canUseLocalFallback(error)) throw error;
    request.log.warn({ err: error }, "Using local points fallback for redemption.");
    return redeemPoints(memoryRepo, normalized);
  });
  const response = { ok: true, result };

  if (idempotencyKey) {
    await storeIdempotency("/points/redeem", idempotencyKey, parsed, response);
  }

  return response;
});

fastify.post("/points/expiry/run", async () => {
  const repo = useMemoryPrimary() ? memoryRepo : supabaseRepo;
  const result = await runExpiry(repo).catch((error) => {
    if (repo === memoryRepo || !canUseLocalFallback(error)) throw error;
    return runExpiry(memoryRepo);
  });
  return { ok: true, result };
});

fastify.get("/points/tiers", async () => {
  const repo = useMemoryPrimary() ? memoryRepo : supabaseRepo;
  const rules = await repo.fetchTierRules().catch((error) => {
    if (repo === memoryRepo || !canUseLocalFallback(error)) throw error;
    return memoryRepo.fetchTierRules();
  });
  return { ok: true, tiers: rules };
});

fastify.get("/health", async () => ({ ok: true }));

return fastify;
}

function isEntrypoint() {
  return process.argv[1] ? path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]) : false;
}

if (isEntrypoint()) {
const fastify = createServer();
fastify.listen({ host: "0.0.0.0", port: config.port }).catch((err) => {
  fastify.log.error(err);
  process.exit(1);
});
}
