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

function tableMissing(error: unknown, table: string) {
  const message = String((error as { message?: unknown; details?: unknown; hint?: unknown })?.message ?? "").toLowerCase();
  return message.includes(table.toLowerCase()) && (message.includes("does not exist") || message.includes("schema cache"));
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
