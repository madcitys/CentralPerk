import Fastify from "fastify";
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

function tableMissing(error: unknown, table: string) {
  const message = String((error as { message?: unknown; details?: unknown; hint?: unknown })?.message ?? "").toLowerCase();
  return message.includes(table.toLowerCase()) && (message.includes("does not exist") || message.includes("schema cache"));
}

function duplicateRecord(error: unknown) {
  return String((error as { code?: unknown })?.code ?? "") === "23505";
}

function pointsUrl(path: string) {
  return `${config.pointsServiceUrl.replace(/\/+$/, "")}${path}`;
}

async function redeemPoints(payload: z.infer<typeof redemptionSchema>) {
  const response = await fetch(pointsUrl("/points/redeem"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      memberIdentifier: payload.memberIdentifier,
      fallbackEmail: payload.fallbackEmail,
      points: payload.points,
      reason: payload.reason,
      transactionType: "REDEEM",
      rewardCatalogId: payload.rewardCatalogId,
    }),
  });
  if (!response.ok) throw new Error(`points-service redemption failed with status ${response.status}`);
  return response.json();
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

export function createServer() {
  const app = Fastify({ logger: true });

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
      if (tableMissing(error, "loyalty_partner_reward_performance")) return { ok: true, performance: [] };
      throw error;
    }
    return { ok: true, performance: data || [] };
  });

  app.post("/rewards/redeem", async (request) => {
    const body = redemptionSchema.parse(request.body);
    const pointsResult = await redeemPoints(body);
    const { data, error } = await supabase
      .from("reward_redemptions")
      .insert({
        member_identifier: body.memberIdentifier,
        reward_catalog_id: Number(body.rewardCatalogId),
        points: body.points,
        status: "redeemed",
      })
      .select("*")
      .single();
    if (error) throw error;
    return { ok: true, redemption: data, points: pointsResult?.result ?? pointsResult };
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
