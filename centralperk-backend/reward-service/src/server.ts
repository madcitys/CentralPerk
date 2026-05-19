import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { config } from "./config.js";
import { supabase } from "./supabase-client.js";

const redemptionSchema = z.object({
  memberIdentifier: z.string().trim().min(1).max(120),
  fallbackEmail: z.string().email().optional(),
  rewardCatalogId: z.union([z.string(), z.number()]),
  points: z.number().int().min(1).max(1_000_000),
  reason: z.string().trim().min(1).max(240).default("Reward redemption"),
  promotionCampaignId: z.string().trim().max(80).nullable().optional(),
});

const partnerSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  partnerCode: z.string().trim().min(1).max(80),
  partnerName: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).nullable().optional(),
  logoUrl: z.string().trim().max(1000).nullable().optional(),
  conversionRate: z.number().min(0.01).optional(),
  isActive: z.boolean().optional(),
});

const voucherSchema = z.object({
  id: z.string().trim().min(1).max(120),
  memberId: z.string().trim().min(1).max(80),
  memberEmail: z.string().trim().email().max(254).nullable().optional(),
  rewardId: z.string().trim().min(1).max(80),
  rewardCatalogId: z.string().trim().max(80).nullable().optional(),
  rewardName: z.string().trim().min(1).max(180),
  pointsCost: z.number().int().min(0).max(1_000_000),
  method: z.enum(["in-store", "online"]),
  voucherCode: z.string().trim().min(1).max(80),
  orderId: z.string().trim().min(1).max(120),
  qrValue: z.string().trim().min(1).max(1000),
  qrTargetUrl: z.string().trim().min(1).max(1000),
  createdAt: z.string().trim().min(1).max(80),
  partnerLabel: z.string().trim().max(120).nullable().optional(),
  deliveryPartner: z.string().trim().max(80).nullable().optional(),
  deliveryAddress: z.string().trim().max(500).nullable().optional(),
  deliveryNotes: z.string().trim().max(500).nullable().optional(),
  contactNumber: z.string().trim().max(40).nullable().optional(),
  status: z.enum(["ready", "processing", "validated"]),
  validatedAt: z.string().trim().max(80).nullable().optional(),
});

const voucherValidationSchema = z.object({
  action: z.literal("validate"),
  voucherCode: z.string().trim().min(1).max(80),
});

const partnerTransactionSchema = z.object({
  partnerId: z.string().trim().min(1).max(80),
  partnerCode: z.string().trim().min(1).max(40),
  partnerName: z.string().trim().min(1).max(160),
  memberId: z.string().trim().min(1).max(80),
  memberEmail: z.string().trim().email().max(254).nullable().optional(),
  orderId: z.string().trim().min(1).max(120),
  points: z.number().int().min(0).max(1_000_000),
  grossAmount: z.number().min(0).max(10_000_000),
  note: z.string().trim().max(500).optional(),
  fulfillmentMethod: z.enum(["in-store", "online"]).default("in-store"),
  deliveryPartner: z.string().trim().max(80).nullable().optional(),
  deliveryAddress: z.string().trim().max(500).nullable().optional(),
  deliveryNotes: z.string().trim().max(500).nullable().optional(),
  contactNumber: z.string().trim().max(40).nullable().optional(),
});

const partnerSettlementSchema = z.object({
  partnerId: z.string().trim().max(80).optional(),
  commissionRate: z.number().min(0).max(1).default(0.12),
});

function tableMissing(error: unknown, table: string) {
  const message = String((error as { message?: unknown; details?: unknown; hint?: unknown })?.message ?? "").toLowerCase();
  return message.includes(table.toLowerCase()) && (message.includes("does not exist") || message.includes("schema cache"));
}

function missingRelation(error: unknown) {
  return String((error as { code?: unknown })?.code ?? "") === "42P01";
}

function duplicateRecord(error: unknown) {
  return String((error as { code?: unknown })?.code ?? "") === "23505";
}

function pointsUrl(path: string) {
  return `${config.pointsServiceUrl.replace(/\/+$/, "")}${path}`;
}

function requestError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

function getIdempotencyKey(request: { headers: Record<string, any>; body?: unknown }) {
  const headerValue = request.headers["idempotency-key"];
  if (typeof headerValue === "string" && headerValue.trim()) return headerValue.trim();

  const bodyValue = request.body && typeof request.body === "object" ? (request.body as { idempotencyKey?: unknown }).idempotencyKey : null;
  return typeof bodyValue === "string" && bodyValue.trim() ? bodyValue.trim() : null;
}

function normalizeRewardCatalogId(value: string | number) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw requestError("Reward catalog ID must be a positive numeric database ID.", 400);
  }
  return numeric;
}

async function loadExistingRedemption(idempotencyKey: string) {
  const { data, error } = await supabase
    .from("reward_redemptions")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function redeemPoints(payload: z.infer<typeof redemptionSchema>, idempotencyKey: string | null) {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const response = await fetch(pointsUrl("/points/redeem"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      memberIdentifier: payload.memberIdentifier,
      fallbackEmail: payload.fallbackEmail,
      points: payload.points,
      reason: payload.reason,
      transactionType: "REDEEM",
      rewardCatalogId: payload.rewardCatalogId,
      promotionCampaignId: payload.promotionCampaignId ?? null,
    }),
  });
  if (!response.ok) throw new Error(`points-service redemption failed with status ${response.status}`);
  return response.json();
}

function mapRedemption(row: Record<string, any>) {
  return {
    id: String(row.id ?? ""),
    memberIdentifier: String(row.member_identifier ?? ""),
    fallbackEmail: row.fallback_email ? String(row.fallback_email) : null,
    rewardCatalogId: row.reward_catalog_id === null || row.reward_catalog_id === undefined ? null : Number(row.reward_catalog_id),
    points: Math.max(0, Math.floor(Number(row.points ?? 0))),
    reason: String(row.reason ?? ""),
    status: String(row.status ?? "redeemed"),
    promotionCampaignId: row.promotion_campaign_id ? String(row.promotion_campaign_id) : null,
    idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : null,
    pointsResult: row.points_result ?? null,
    redeemedAt: String(row.redeemed_at ?? row.created_at ?? new Date().toISOString()),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapVoucher(row: Record<string, any>) {
  return {
    id: String(row.id ?? ""),
    memberId: String(row.member_id ?? ""),
    memberEmail: row.member_email ? String(row.member_email) : null,
    rewardId: String(row.reward_id ?? ""),
    rewardCatalogId: row.reward_catalog_id ? String(row.reward_catalog_id) : null,
    rewardName: String(row.reward_name ?? ""),
    pointsCost: Math.max(0, Math.floor(Number(row.points_cost ?? 0))),
    method: String(row.method ?? "in-store") === "online" ? "online" : "in-store",
    voucherCode: String(row.voucher_code ?? ""),
    orderId: String(row.order_id ?? ""),
    qrValue: String(row.qr_value ?? ""),
    qrTargetUrl: String(row.qr_target_url ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    partnerLabel: row.partner_label ? String(row.partner_label) : null,
    deliveryPartner: row.delivery_partner ? String(row.delivery_partner) : null,
    deliveryAddress: row.delivery_address ? String(row.delivery_address) : null,
    deliveryNotes: row.delivery_notes ? String(row.delivery_notes) : null,
    contactNumber: row.contact_number ? String(row.contact_number) : null,
    status: String(row.status ?? "ready") as "ready" | "processing" | "validated",
    validatedAt: row.validated_at ? String(row.validated_at) : null,
  };
}

function mapPartner(row: Record<string, any>) {
  return {
    id: String(row.id ?? ""),
    partnerCode: String(row.partner_code ?? ""),
    partnerName: String(row.partner_name ?? "Partner"),
    description: row.description ? String(row.description) : null,
    logoUrl: row.logo_url ? String(row.logo_url) : null,
    conversionRate: Number(row.conversion_rate ?? 1),
    isActive: Boolean(row.is_active ?? true),
  };
}

function mapPartnerTransaction(row: Record<string, any>) {
  return {
    id: String(row.id ?? ""),
    partnerId: String(row.partner_id ?? ""),
    partnerCode: String(row.partner_code ?? ""),
    partnerName: String(row.partner_name ?? ""),
    memberId: String(row.member_id ?? ""),
    memberEmail: row.member_email ? String(row.member_email) : null,
    orderId: String(row.order_id ?? ""),
    points: Math.max(0, Math.floor(Number(row.points ?? 0))),
    grossAmount: Math.max(0, Number(row.gross_amount ?? 0)),
    note: String(row.note ?? ""),
    fulfillmentMethod: String(row.fulfillment_method ?? "in-store") === "online" ? "online" : "in-store",
    deliveryPartner: row.delivery_partner ? String(row.delivery_partner) : null,
    deliveryAddress: row.delivery_address ? String(row.delivery_address) : null,
    deliveryNotes: row.delivery_notes ? String(row.delivery_notes) : null,
    contactNumber: row.contact_number ? String(row.contact_number) : null,
    occurredAt: String(row.occurred_at ?? new Date().toISOString()),
    settlementId: row.settlement_id ? String(row.settlement_id) : null,
    settledAt: row.settled_at ? String(row.settled_at) : null,
  };
}

function mapPartnerSettlement(row: Record<string, any>) {
  return {
    id: String(row.id ?? ""),
    partnerId: String(row.partner_id ?? ""),
    partnerCode: String(row.partner_code ?? ""),
    partnerName: String(row.partner_name ?? ""),
    totalTransactions: Math.max(0, Math.floor(Number(row.total_transactions ?? 0))),
    totalPoints: Math.max(0, Math.floor(Number(row.total_points ?? 0))),
    totalGrossAmount: Math.max(0, Number(row.total_gross_amount ?? 0)),
    commissionRate: Math.max(0, Number(row.commission_rate ?? 0)),
    commissionAmount: Math.max(0, Number(row.commission_amount ?? 0)),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    transactionIds: Array.isArray(row.transaction_ids) ? row.transaction_ids.map(String) : [],
  };
}

function voucherTableUnavailable(reply: any, error: unknown) {
  if (!tableMissing(error, "reward_vouchers")) return false;
  reply.code(503).send({
    ok: false,
    error: {
      message: "reward_vouchers table is missing in Reward Service DB. Run the reward_vouchers migration before using voucher APIs.",
    },
  });
  return true;
}

function partnerTablesUnavailable(reply: any, error: unknown) {
  if (!tableMissing(error, "reward_partner_transactions") && !tableMissing(error, "reward_partner_settlements")) {
    return false;
  }
  reply.code(503).send({
    ok: false,
    error: {
      message:
        "Reward Service partner transaction tables are missing. Run the reward partner persistence migration before using partner settlement APIs.",
    },
  });
  return true;
}

export function createServer() {
  const app = Fastify({ logger: true });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      reply.code(400).send({
        ok: false,
        error: "validation_failed",
        details: error.flatten(),
      });
      return;
    }

    request.log.error(error);
    const statusCode = typeof error.statusCode === "number" ? error.statusCode : 500;
    reply.code(statusCode).send({
      ok: false,
      error: statusCode >= 500 ? "internal_error" : "request_error",
      message: error.message,
    });
  });

  app.get("/health", async () => ({
    status: "ok",
    service: config.serviceName,
    dbMode: config.dbMode,
    schema: config.schema,
  }));

  app.get("/health/db", async (_request, reply) => {
    const { error } = await supabase.from("rewards_catalog").select("id").limit(1);
    if (error) {
      reply.code(503).send({
        status: "error",
        service: config.serviceName,
        dbMode: config.dbMode,
        schema: config.schema,
        database: { connected: false, check: "rewards_catalog" },
      });
      return;
    }

    return {
      status: "ok",
      service: config.serviceName,
      dbMode: config.dbMode,
      schema: config.schema,
      database: { connected: true, check: "rewards_catalog" },
    };
  });

  app.get("/rewards", async () => {
    let result = await supabase
      .from("rewards_catalog")
      .select("*, reward_partners(id,partner_code,partner_name,logo_url,conversion_rate,is_active)")
      .order("points_cost", { ascending: true })
      .limit(500);
    if (result.error) {
      result = await supabase.from("rewards_catalog").select("*").order("points_cost", { ascending: true }).limit(500);
    }
    const { data, error } = result;
    if (error) throw error;
    return {
      ok: true,
      rewards: (data || []).map((row: any) => {
        const partner = row.reward_partners || null;
        return {
          ...row,
          partner_code: partner?.partner_code ?? row.partner_code ?? null,
          partner_name: partner?.partner_name ?? row.partner_name ?? null,
          partner_logo_url: partner?.logo_url ?? row.partner_logo_url ?? null,
          partner_conversion_rate: partner?.conversion_rate ?? row.partner_conversion_rate ?? null,
        };
      }),
    };
  });

  app.get("/reward-partners", async () => {
    const { data, error } = await supabase.from("reward_partners").select("*").order("partner_name", { ascending: true });
    if (error) {
      if (tableMissing(error, "reward_partners")) return { ok: true, partners: [] };
      throw error;
    }
    return { ok: true, partners: data || [] };
  });

  app.post("/reward-partners", async (request) => {
    const body = partnerSchema.parse(request.body || {});
    const payload = {
      partner_code: body.partnerCode.trim().toUpperCase(),
      partner_name: body.partnerName.trim(),
      description: body.description?.trim() || null,
      logo_url: body.logoUrl?.trim() || null,
      conversion_rate: Math.max(0.01, Number(body.conversionRate ?? 1)),
      is_active: body.isActive ?? true,
    };
    const query = body.id
      ? supabase.from("reward_partners").update(payload).eq("id", body.id).select("*").single()
      : supabase.from("reward_partners").insert(payload).select("*").single();
    const { data, error } = await query;
    if (error) throw error;
    return { ok: true, partner: data };
  });

  app.get("/partners/dashboard", async () => {
    const partnersResult = await supabase.from("reward_partners").select("*").order("partner_name", { ascending: true });
    if (partnersResult.error) {
      if (tableMissing(partnersResult.error, "reward_partners")) return { ok: true, partners: [] };
      throw partnersResult.error;
    }

    const transactionsResult = await supabase
      .from("reward_partner_transactions")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(5000);

    if (transactionsResult.error) {
      if (tableMissing(transactionsResult.error, "reward_partner_transactions")) {
        return {
          ok: true,
          partners: (partnersResult.data || []).map((partner: any) => ({
            partner: mapPartner(partner),
            totals: {
              transactions: 0,
              pendingTransactions: 0,
              settledTransactions: 0,
              points: 0,
              grossAmount: 0,
              totalCommission: 0,
            },
          })),
          warning: "reward_partner_transactions_table_missing",
        };
      }
      throw transactionsResult.error;
    }

    const settlementsResult = await supabase
      .from("reward_partner_settlements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5000);

    if (settlementsResult.error) {
      if (!tableMissing(settlementsResult.error, "reward_partner_settlements")) throw settlementsResult.error;
    }

    const transactions = (transactionsResult.data || []).map((row: any) => mapPartnerTransaction(row));
    const settlements = ((settlementsResult.data || []) as any[]).map((row) => mapPartnerSettlement(row));

    return {
      ok: true,
      partners: (partnersResult.data || []).map((row: any) => {
        const partner = mapPartner(row);
        const partnerTransactions = transactions.filter((item) => item.partnerId === partner.id);
        const pendingTransactions = partnerTransactions.filter((item) => !item.settlementId);
        const partnerSettlements = settlements.filter((item) => item.partnerId === partner.id);
        return {
          partner,
          totals: {
            transactions: partnerTransactions.length,
            pendingTransactions: pendingTransactions.length,
            settledTransactions: partnerTransactions.length - pendingTransactions.length,
            points: partnerTransactions.reduce((sum, item) => sum + item.points, 0),
            grossAmount: partnerTransactions.reduce((sum, item) => sum + item.grossAmount, 0),
            totalCommission: partnerSettlements.reduce((sum, item) => sum + item.commissionAmount, 0),
          },
        };
      }),
    };
  });

  app.post("/partners/transactions", async (request, reply) => {
    const body = partnerTransactionSchema.parse(request.body || {});
    const payload = {
      id: randomUUID(),
      partner_id: body.partnerId,
      partner_code: body.partnerCode.trim().toUpperCase(),
      partner_name: body.partnerName.trim(),
      member_id: body.memberId.trim(),
      member_email: body.memberEmail?.trim() || null,
      order_id: body.orderId.trim(),
      points: Math.max(0, Math.floor(body.points)),
      gross_amount: Math.max(0, Number(body.grossAmount || 0)),
      note: body.note?.trim() || "",
      fulfillment_method: body.fulfillmentMethod,
      delivery_partner: body.deliveryPartner?.trim() || null,
      delivery_address: body.deliveryAddress?.trim() || null,
      delivery_notes: body.deliveryNotes?.trim() || null,
      contact_number: body.contactNumber?.trim() || null,
      occurred_at: new Date().toISOString(),
      settlement_id: null,
      settled_at: null,
    };

    const { data, error } = await supabase.from("reward_partner_transactions").insert(payload).select("*").single();
    if (error) {
      if (partnerTablesUnavailable(reply, error)) return;
      if (duplicateRecord(error)) {
        reply.code(409).send({ ok: false, error: { message: "A partner transaction with this order ID already exists." } });
        return;
      }
      throw error;
    }
    return { ok: true, transaction: mapPartnerTransaction(data as Record<string, any>) };
  });

  app.post("/partners/settlements", async (request, reply) => {
    const body = partnerSettlementSchema.parse(request.body || {});
    let pendingQuery = supabase
      .from("reward_partner_transactions")
      .select("*")
      .is("settlement_id", null)
      .order("occurred_at", { ascending: true })
      .limit(5000);
    if (body.partnerId) pendingQuery = pendingQuery.eq("partner_id", body.partnerId);

    const pendingResult = await pendingQuery;
    if (pendingResult.error) {
      if (partnerTablesUnavailable(reply, pendingResult.error)) return;
      throw pendingResult.error;
    }

    const pending = (pendingResult.data || []).map((row: any) => mapPartnerTransaction(row));
    if (pending.length === 0) {
      reply.code(404).send({ ok: false, error: { message: "No pending partner transactions were found for settlement." } });
      return;
    }

    const first = pending[0];
    const settlementId = randomUUID();
    const createdAt = new Date().toISOString();
    const transactionIds = pending.map((item) => item.id);
    const totalGrossAmount = pending.reduce((sum, item) => sum + item.grossAmount, 0);
    const settlementPayload = {
      id: settlementId,
      partner_id: first.partnerId,
      partner_code: first.partnerCode,
      partner_name: first.partnerName,
      total_transactions: pending.length,
      total_points: pending.reduce((sum, item) => sum + item.points, 0),
      total_gross_amount: totalGrossAmount,
      commission_rate: Math.max(0, Number(body.commissionRate ?? 0.12)),
      commission_amount: Number((totalGrossAmount * Math.max(0, Number(body.commissionRate ?? 0.12))).toFixed(2)),
      created_at: createdAt,
      transaction_ids: transactionIds,
    };

    const settlementResult = await supabase
      .from("reward_partner_settlements")
      .insert(settlementPayload)
      .select("*")
      .single();
    if (settlementResult.error) {
      if (partnerTablesUnavailable(reply, settlementResult.error)) return;
      throw settlementResult.error;
    }

    const updateResult = await supabase
      .from("reward_partner_transactions")
      .update({ settlement_id: settlementId, settled_at: createdAt })
      .in("id", transactionIds);
    if (updateResult.error) throw updateResult.error;

    return { ok: true, settlement: mapPartnerSettlement(settlementResult.data as Record<string, any>) };
  });

  app.get("/partners/settlements/:id", async (request, reply) => {
    const id = String((request.params as any).id || "").trim();
    if (!id) {
      reply.code(400).send({ ok: false, error: { message: "Settlement ID is required." } });
      return;
    }

    const { data, error } = await supabase.from("reward_partner_settlements").select("*").eq("id", id).limit(1).maybeSingle();
    if (error) {
      if (partnerTablesUnavailable(reply, error)) return;
      throw error;
    }
    if (!data) {
      reply.code(404).send({ ok: false, error: { message: "Settlement not found." } });
      return;
    }

    return { ok: true, settlement: mapPartnerSettlement(data as Record<string, any>) };
  });

  app.patch("/reward-partners/:id", async (request, reply) => {
    const id = String((request.params as any).id || "").trim();
    const body = request.body as Record<string, any>;
    if (!id) {
      reply.code(400).send({ ok: false, error: "partner_id_required" });
      return;
    }
    const { data, error } = await supabase
      .from("reward_partners")
      .update({ is_active: Boolean(body.isActive) })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return { ok: true, partner: data };
  });

  app.get("/reward-partners/performance", async () => {
    const { data, error } = await supabase.rpc("loyalty_partner_reward_performance");
    if (error) {
      if (
        missingRelation(error) ||
        tableMissing(error, "loyalty_partner_reward_performance") ||
        tableMissing(error, "loyalty_transactions")
      ) {
        return { ok: true, performance: [], warning: "reward_partner_performance_unavailable" };
      }
      throw error;
    }
    return { ok: true, performance: data || [] };
  });

  app.post("/rewards/redeem", async (request) => {
    const parsed = redemptionSchema.parse(request.body);
    const idempotencyKey = getIdempotencyKey(request);
    const rewardCatalogId = normalizeRewardCatalogId(parsed.rewardCatalogId);

    if (idempotencyKey) {
      const existing = await loadExistingRedemption(idempotencyKey);
      if (existing) {
        return {
          ok: true,
          redemption: mapRedemption(existing as Record<string, any>),
          points: (existing as Record<string, any>).points_result ?? null,
          replayed: true,
        };
      }
    }

    const rewardResult = await supabase
      .from("rewards_catalog")
      .select("id,reward_id,name,points_cost,is_active")
      .eq("id", rewardCatalogId)
      .limit(1)
      .maybeSingle();

    if (rewardResult.error) throw rewardResult.error;
    if (!rewardResult.data) throw requestError("Reward was not found in the rewards catalog.", 404);
    if (!Boolean((rewardResult.data as Record<string, any>).is_active ?? true)) {
      throw requestError("Reward is not currently active.", 409);
    }

    const dbPointsCost = Math.max(0, Math.floor(Number((rewardResult.data as Record<string, any>).points_cost ?? 0)));
    if (dbPointsCost <= 0) throw requestError("Reward does not have a valid point cost.", 409);
    if (dbPointsCost !== parsed.points) {
      throw requestError("Reward point cost changed. Refresh the rewards catalog and try again.", 409);
    }

    const body = {
      ...parsed,
      rewardCatalogId,
      points: dbPointsCost,
    };
    const pointsResponse = await redeemPoints(body, idempotencyKey);
    const pointsResult = pointsResponse?.result ?? pointsResponse;

    const { data, error } = await supabase
      .from("reward_redemptions")
      .insert({
        member_identifier: body.memberIdentifier,
        fallback_email: body.fallbackEmail ?? null,
        reward_catalog_id: rewardCatalogId,
        points: body.points,
        reason: body.reason,
        status: "redeemed",
        promotion_campaign_id: body.promotionCampaignId ?? null,
        idempotency_key: idempotencyKey,
        points_result: pointsResult,
        redeemed_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      if (duplicateRecord(error) && idempotencyKey) {
        const existing = await loadExistingRedemption(idempotencyKey);
        if (existing) {
          return {
            ok: true,
            redemption: mapRedemption(existing as Record<string, any>),
            points: (existing as Record<string, any>).points_result ?? pointsResult,
            replayed: true,
          };
        }
      }
      throw error;
    }

    return { ok: true, redemption: mapRedemption(data as Record<string, any>), points: pointsResult };
  });

  app.get("/vouchers", async (request, reply) => {
    const query = request.query as Record<string, any>;
    const memberId = String(query.memberId || "").trim();
    const memberEmail = String(query.email || query.memberEmail || "").trim();
    const limit = Math.min(1000, Math.max(1, Number(query.limit || 500) || 500));

    let builder = supabase.from("reward_vouchers").select("*").order("created_at", { ascending: false }).limit(limit);
    if (memberId && memberEmail) {
      builder = builder.or(`member_id.eq.${memberId},member_email.ilike.${memberEmail}`);
    } else if (memberId) {
      builder = builder.eq("member_id", memberId);
    } else if (memberEmail) {
      builder = builder.ilike("member_email", memberEmail);
    }

    const { data, error } = await builder;
    if (error) {
      if (voucherTableUnavailable(reply, error)) return;
      throw error;
    }

    return { ok: true, vouchers: (data || []).map((row: any) => mapVoucher(row)) };
  });

  app.post("/vouchers", async (request, reply) => {
    const body = voucherSchema.parse(request.body || {});
    const payload = {
      id: body.id.trim(),
      member_id: body.memberId.trim(),
      member_email: body.memberEmail?.trim() || null,
      reward_id: body.rewardId.trim(),
      reward_catalog_id: body.rewardCatalogId?.trim() || null,
      reward_name: body.rewardName.trim(),
      points_cost: Math.max(0, Math.floor(body.pointsCost)),
      method: body.method,
      voucher_code: body.voucherCode.trim().toUpperCase(),
      order_id: body.orderId.trim().toUpperCase(),
      qr_value: body.qrValue.trim(),
      qr_target_url: body.qrTargetUrl.trim(),
      partner_label: body.partnerLabel?.trim() || null,
      delivery_partner: body.deliveryPartner?.trim() || null,
      delivery_address: body.deliveryAddress?.trim() || null,
      delivery_notes: body.deliveryNotes?.trim() || null,
      contact_number: body.contactNumber?.trim() || null,
      status: body.status,
      created_at: body.createdAt,
      validated_at: body.validatedAt ?? null,
    };

    const { data, error } = await supabase.from("reward_vouchers").insert(payload).select("*").single();
    if (error) {
      if (voucherTableUnavailable(reply, error)) return;
      if (duplicateRecord(error)) {
        reply.code(409).send({ ok: false, error: { message: "This voucher already exists." } });
        return;
      }
      throw error;
    }

    return { ok: true, voucher: mapVoucher(data as Record<string, any>) };
  });

  app.get("/vouchers/:id", async (request, reply) => {
    const id = String((request.params as any).id || "").trim();
    if (!id) {
      reply.code(400).send({ ok: false, error: { message: "Voucher ID is required." } });
      return;
    }

    const { data, error } = await supabase.from("reward_vouchers").select("*").eq("id", id).limit(1).maybeSingle();
    if (error) {
      if (voucherTableUnavailable(reply, error)) return;
      throw error;
    }
    if (!data) {
      reply.code(404).send({ ok: false, error: { message: "Voucher not found." } });
      return;
    }

    return { ok: true, voucher: mapVoucher(data as Record<string, any>) };
  });

  app.patch("/vouchers/:id", async (request, reply) => {
    const id = String((request.params as any).id || "").trim();
    if (!id) {
      reply.code(400).send({ ok: false, error: { message: "Voucher ID is required." } });
      return;
    }

    const body = voucherValidationSchema.parse(request.body || {});
    const existing = await supabase.from("reward_vouchers").select("*").eq("id", id).limit(1).maybeSingle();
    if (existing.error) {
      if (voucherTableUnavailable(reply, existing.error)) return;
      throw existing.error;
    }
    if (!existing.data) {
      reply.code(404).send({ ok: false, error: { message: "Voucher not found." } });
      return;
    }

    const voucher = existing.data as Record<string, any>;
    if (String(voucher.voucher_code || "").trim().toUpperCase() !== body.voucherCode.trim().toUpperCase()) {
      reply.code(400).send({ ok: false, error: { message: "Voucher code does not match this QR." } });
      return;
    }

    if (voucher.status === "validated") return { ok: true, voucher: mapVoucher(voucher) };

    const { data, error } = await supabase
      .from("reward_vouchers")
      .update({ status: "validated", validated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    return { ok: true, voucher: mapVoucher(data as Record<string, any>) };
  });

  return app;
}

const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isDirectRun) {
  const app = createServer();
  app.listen({ host: "0.0.0.0", port: config.port }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}
