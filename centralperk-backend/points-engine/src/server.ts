import Fastify from "fastify";
import { z } from "zod";
import { awardPoints, redeemPoints, runExpiry } from "./core/engine.js";
import { supabaseRepo } from "./supabase-repo.js";
import { IdempotencyConflictError, checkIdempotency, storeIdempotency } from "./idempotency.js";
import { config } from "./config.js";
import { supabase } from "./supabase-client.js";

const fastify = Fastify({
  logger: true,
});

fastify.setErrorHandler((error, request, reply) => {
  if (error instanceof z.ZodError) {
    reply.code(400).send({
      ok: false,
      error: "validation_failed",
      details: error.flatten(),
    });
    return;
  }

  if (error instanceof IdempotencyConflictError) {
    reply.code(409).send({
      ok: false,
      error: "idempotency_conflict",
      message: error.message,
    });
    return;
  }

  request.log.error(error);
  const statusCode = typeof (error as { statusCode?: unknown }).statusCode === "number"
    ? Number((error as { statusCode: number }).statusCode)
    : 500;
  reply.code(statusCode).send({
    ok: false,
    error: statusCode >= 500 ? "internal_error" : "request_error",
    message: error instanceof Error ? error.message : "Unexpected server error.",
  });
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

const tierRulesSchema = z.object({
  rules: z.array(
    z.object({
      tier_label: z.string().trim().min(1).max(40),
      min_points: z.coerce.number().int().min(0),
      is_active: z.boolean().optional(),
    }),
  ),
});

const earningRulesSchema = z.object({
  rules: z.array(
    z.object({
      tier_label: z.string().trim().min(1).max(40),
      peso_per_point: z.coerce.number().min(0.01),
      multiplier: z.coerce.number().min(0.01),
      is_active: z.boolean().optional(),
    }),
  ),
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

fastify.put("/points/tiers", async (request) => {
  const parsed = tierRulesSchema.parse(request.body);
  const rows = parsed.rules.map((rule) => ({
    tier_label: rule.tier_label,
    min_points: Math.max(0, Math.floor(Number(rule.min_points) || 0)),
    is_active: rule.is_active ?? true,
  }));

  const { error } = await supabase.from("points_tiers").upsert(rows, { onConflict: "tier_label" });
  if (error) throw error;

  return { ok: true, tiers: rows };
});

fastify.get("/points/earning-rules", async () => {
  const { data, error } = await supabase
    .from("earning_rules")
    .select("tier_label,peso_per_point,multiplier,is_active,effective_at")
    .eq("is_active", true)
    .order("effective_at", { ascending: false });

  if (error) throw error;
  return { ok: true, earningRules: data || [] };
});

fastify.put("/points/earning-rules", async (request) => {
  const parsed = earningRulesSchema.parse(request.body);

  for (const rule of parsed.rules) {
    const tier = rule.tier_label.trim();
    const { error: deactivateError } = await supabase
      .from("earning_rules")
      .update({ is_active: false })
      .eq("tier_label", tier)
      .eq("is_active", true);
    if (deactivateError) throw deactivateError;

    const { error: insertError } = await supabase.from("earning_rules").insert({
      tier_label: tier,
      peso_per_point: Math.max(0.01, Number(rule.peso_per_point) || 10),
      multiplier: Math.max(0.01, Number(rule.multiplier) || 1),
      is_active: rule.is_active ?? true,
      effective_at: new Date().toISOString(),
    });
    if (insertError) throw insertError;
  }

  return { ok: true };
});

fastify.get("/points/earn-tasks", async () => {
  const { data, error } = await supabase
    .from("earn_tasks")
    .select("*")
    .eq("is_active", true)
    .order("points", { ascending: false });

  if (error) throw error;
  return { ok: true, earnTasks: data || [] };
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
