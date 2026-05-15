import Fastify from "fastify";
import { z } from "zod";
import { awardPoints, redeemPoints, runExpiry } from "./core/engine.js";
import { supabaseRepo } from "./supabase-repo.js";
import { checkIdempotency, storeIdempotency } from "./idempotency.js";
import { config } from "./config.js";
import { supabase } from "./supabase-client.js";

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

const activityQuerySchema = z.object({
  memberIdentifier: z.string().trim().min(1).max(120),
  fallbackEmail: z.string().trim().email().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});

const ledgerQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
});

function mapLedgerRow(row: Record<string, any>) {
  return {
    id: row.id,
    member_id: row.member_id,
    transaction_id: row.id,
    transaction_type: row.change_type,
    points: Number(row.points_delta || 0),
    balance: row.balance_after === null || row.balance_after === undefined ? null : Number(row.balance_after),
    transaction_date: row.created_at,
    expiry_date: row.expiry_date ?? null,
    reason: row.reason ?? "",
    reward_catalog_id: row.reward_catalog_id ?? null,
    promotion_campaign_id: row.promotion_campaign_id ?? null,
  };
}

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

fastify.get("/points/activity", async (request, reply) => {
  const query = activityQuerySchema.parse(request.query);
  const member = await supabaseRepo.findMember(query.memberIdentifier, query.fallbackEmail);
  if (!member) {
    reply.code(404).send({ ok: false, error: "member_not_found" });
    return;
  }

  const { data, error } = await supabase
    .from("points_ledger")
    .select(
      "id,member_id,change_type,points_delta,balance_after,reason,reward_catalog_id,promotion_campaign_id,expiry_date,created_at",
    )
    .eq("member_id", member.id)
    .order("created_at", { ascending: false })
    .limit(query.limit);

  if (error) throw error;

  return {
    ok: true,
    balance: {
      member_id: member.member_number ?? query.memberIdentifier,
      points_balance: member.points_balance,
      tier: member.tier ?? "Bronze",
    },
    history: (data || []).map((row) => mapLedgerRow(row as Record<string, any>)),
  };
});

fastify.get("/points/ledger", async (request) => {
  const query = ledgerQuerySchema.parse(request.query);
  const { data, error } = await supabase
    .from("points_ledger")
    .select(
      "id,member_id,change_type,points_delta,balance_after,reason,reward_catalog_id,promotion_campaign_id,expiry_date,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(query.limit);

  if (error) throw error;

  return {
    ok: true,
    transactions: (data || []).map((row) => mapLedgerRow(row as Record<string, any>)),
  };
});

fastify.get("/health", async () => ({
  status: "ok",
  service: config.serviceName,
  dbMode: config.dbMode,
  schema: config.schema,
}));

fastify.get("/health/db", async (_request, reply) => {
  const { supabase } = await import("./supabase-client.js");
  const { error } = await supabase.from("points_ledger").select("id").limit(1);
  if (error) {
    reply.code(503).send({
      status: "error",
      service: config.serviceName,
      dbMode: config.dbMode,
      schema: config.schema,
      database: { connected: false, check: "points_ledger" },
    });
    return;
  }

  return {
    status: "ok",
    service: config.serviceName,
    dbMode: config.dbMode,
    schema: config.schema,
    database: { connected: true, check: "points_ledger" },
  };
});

fastify.listen({ host: "0.0.0.0", port: config.port }).catch((err) => {
  fastify.log.error(err);
  process.exit(1);
});
