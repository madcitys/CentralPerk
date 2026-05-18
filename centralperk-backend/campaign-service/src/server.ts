import Fastify from "fastify";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { config } from "./config.js";
import { supabase } from "./supabase-client.js";
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
  countdownLabel: z.string().trim().max(120).nullable().optional(),
  bannerTitle: z.string().trim().max(120).nullable().optional(),
  bannerMessage: z.string().trim().max(280).nullable().optional(),
  bannerColor: z.string().trim().max(32).optional(),
  pushNotificationEnabled: z.boolean().optional(),
  budgetLimit: z.number().min(0).nullable().optional(),
  autoPause: z.boolean().optional(),
});

const multiplierSchema = z.object({
  memberIdentifier: z.string().trim().min(1).max(120),
  fallbackEmail: z.string().email().optional(),
  tier: z.string().optional(),
  amountSpent: z.number().min(0).max(10_000_000),
});

const winbackSchema = z.object({
  name: z.string().trim().min(1).max(160),
  segment: z.string().trim().max(80),
  offerType: z.string().trim().max(80),
  offerValue: z.string().trim().max(240),
  targetedMembers: z.number().int().min(0).optional(),
  responses: z.number().int().min(0).optional(),
  reengagedMembers: z.number().int().min(0).optional(),
  estimatedRevenue: z.number().min(0).optional(),
  offerCost: z.number().min(0).optional(),
  status: z.enum(["scheduled", "running", "completed"]).optional(),
});

function tableMissing(error: unknown, table: string) {
  const message = String((error as { message?: unknown; details?: unknown; hint?: unknown })?.message ?? "").toLowerCase();
  return message.includes(table.toLowerCase()) && (message.includes("does not exist") || message.includes("schema cache"));
}

  fastify.get("/health", async () => ({
    status: "ok",
    service: config.serviceName,
    dbMode: config.dbMode,
    schema: config.schema,
  }));

  fastify.get("/health/db", async (_request, reply) => {
    const { supabase } = await import("./supabase-client.js");
    const { error } = await supabase.from("promotion_campaigns").select("id").limit(1);
    if (error) {
      reply.code(503).send({
        status: "error",
        service: config.serviceName,
        dbMode: config.dbMode,
        schema: config.schema,
        database: { connected: false, check: "promotion_campaigns" },
      });
      return;
    }

    return {
      status: "ok",
      service: config.serviceName,
      dbMode: config.dbMode,
      schema: config.schema,
      database: { connected: true, check: "promotion_campaigns" },
    };
  });

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

fastify.patch("/campaigns/:id/publish", async (request, reply) => {
  const campaignId = String((request.params as any).id || "").trim();
  if (!campaignId) {
    reply.code(400).send({ ok: false, error: "campaign_id_required" });
    return;
  }

  const body = z.object({ queueNotifications: z.boolean().optional() }).parse(request.body ?? {});
  const campaigns = await getCampaigns();
  const existing = campaigns.find((campaign) => campaign.id === campaignId);
  if (!existing) {
    reply.code(404).send({ ok: false, error: "campaign_not_found" });
    return;
  }

  const campaign = await saveCampaign({ ...existing, status: "active" });
  const notificationsQueued = body.queueNotifications ? await queueCampaignNotifications(campaignId) : 0;
  return { ok: true, campaign, notificationsQueued };
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

fastify.post("/campaigns/flash-sale/claim", async (request, reply) => {
  const body = z.object({ campaignId: z.string().trim().min(1).max(120) }).parse(request.body || {});
  const campaignId = body.campaignId;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const campaignRes = await supabase
      .from("promotion_campaigns")
      .select("id,campaign_type,status,flash_sale_quantity_limit,flash_sale_claimed_count,starts_at,ends_at")
      .eq("id", campaignId)
      .limit(1)
      .maybeSingle();

    if (campaignRes.error) throw campaignRes.error;
    if (!campaignRes.data?.id) {
      reply.code(404).send({ ok: false, error: { message: "Flash sale campaign not found." } });
      return;
    }

    const campaign = campaignRes.data as any;
    if (String(campaign.campaign_type || "") !== "flash_sale") {
      reply.code(400).send({ ok: false, error: { message: "Campaign is not a flash sale." } });
      return;
    }

    const now = Date.now();
    const startsAt = new Date(String(campaign.starts_at ?? "")).getTime();
    const endsAt = new Date(String(campaign.ends_at ?? "")).getTime();
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || now < startsAt || now > endsAt) {
      reply.code(409).send({ ok: false, error: { message: "Flash sale time limit expired." } });
      return;
    }

    const claimedCount = Number(campaign.flash_sale_claimed_count ?? 0);
    const quantityLimit =
      campaign.flash_sale_quantity_limit === null || campaign.flash_sale_quantity_limit === undefined
        ? null
        : Number(campaign.flash_sale_quantity_limit);

    if (quantityLimit !== null && claimedCount >= quantityLimit) {
      reply.code(409).send({ ok: false, error: { message: "Flash sale quantity limit reached (Sold Out)." } });
      return;
    }

    const nextClaimedCount = claimedCount + 1;
    const updateRes = await supabase
      .from("promotion_campaigns")
      .update({
        flash_sale_claimed_count: nextClaimedCount,
        status: quantityLimit !== null && nextClaimedCount >= quantityLimit ? "completed" : String(campaign.status || "active"),
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaignId)
      .eq("flash_sale_claimed_count", claimedCount)
      .select("id,flash_sale_claimed_count,flash_sale_quantity_limit,ends_at,status")
      .limit(1)
      .maybeSingle();

    if (updateRes.error) throw updateRes.error;
    if (updateRes.data?.id) {
      return {
        ok: true,
        claim: {
          campaignId: String(updateRes.data.id),
          claimedCount: Number(updateRes.data.flash_sale_claimed_count ?? nextClaimedCount),
          quantityLimit:
            updateRes.data.flash_sale_quantity_limit === null || updateRes.data.flash_sale_quantity_limit === undefined
              ? null
              : Number(updateRes.data.flash_sale_quantity_limit),
          endsAt: String(updateRes.data.ends_at ?? campaign.ends_at ?? new Date().toISOString()),
          status: String(updateRes.data.status || "active"),
        },
      };
    }
  }

  reply.code(409).send({ ok: false, error: { message: "Unable to claim flash sale due to concurrent updates. Please retry." } });
});

fastify.get("/winback-campaigns", async () => {
  const { data, error } = await supabase
    .from("winback_campaigns")
    .select("id,campaign_name,segment,offer_type,offer_value,status,targeted_members,responses,reengaged_members,estimated_revenue,offer_cost,launch_date")
    .order("launch_date", { ascending: false });

  if (error) {
    if (tableMissing(error, "winback_campaigns")) return { ok: true, campaigns: [] };
    throw error;
  }

  return { ok: true, campaigns: data || [] };
});

fastify.post("/winback-campaigns", async (request) => {
  const body = winbackSchema.parse(request.body || {});
  const { data, error } = await supabase
    .from("winback_campaigns")
    .insert({
      campaign_code: `WB-${Date.now()}`,
      campaign_name: body.name,
      segment: body.segment,
      offer_type: body.offerType,
      offer_value: body.offerValue,
      status: body.status ?? "scheduled",
      targeted_members: body.targetedMembers ?? 0,
      responses: body.responses ?? 0,
      reengaged_members: body.reengagedMembers ?? 0,
      estimated_revenue: body.estimatedRevenue ?? 0,
      offer_cost: body.offerCost ?? 0,
      launch_date: new Date().toISOString(),
    })
    .select("id,campaign_name,segment,offer_type,offer_value,status,targeted_members,responses,reengaged_members,estimated_revenue,offer_cost,launch_date")
    .single();

  if (error) {
    if (tableMissing(error, "winback_campaigns")) return { ok: true, campaign: null };
    throw error;
  }

  return { ok: true, campaign: data };
});

fastify.post("/campaigns/:id/notify", async (request) => {
  const campaignId = String((request.params as any).id || "");
  const queued = await queueCampaignNotifications(campaignId);
  return { ok: true, notificationsQueued: queued };
});

  return fastify;
}

const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isDirectRun) {
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
