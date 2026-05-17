// @ts-nocheck
import { z } from "zod";
import type { PromotionCampaign, PromotionCampaignInput } from "../app/lib/promotions";
import {
  loadPromotionCampaigns,
  loadActivePromotionCampaigns,
  savePromotionCampaign,
  loadCampaignPerformance,
  queueCampaignNotifications,
} from "../app/lib/promotions";
import { HttpError } from "./http-error";
import { createApiHandler } from "./route-utils";

const stringListFromCsv = z
  .union([z.array(z.string()), z.string()])
  .optional()
  .transform((value) => {
    if (!value) return [] as string[];
    if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  });

export const campaignSchema = z
  .object({
    id: z.string().trim().max(80).optional(),
    campaignCode: z.string().trim().min(1).max(80),
    campaignName: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    campaignType: z.enum(["bonus_points", "flash_sale", "multiplier_event"]),
    status: z.enum(["draft", "scheduled", "active", "completed", "archived"]).optional(),
    multiplier: z.number().min(0).max(100).optional(),
    minimumPurchaseAmount: z.number().min(0).max(10_000_000).optional(),
    bonusPoints: z.number().int().min(0).max(1_000_000).optional(),
    productScope: stringListFromCsv,
    eligibleTiers: stringListFromCsv,
    rewardId: z.union([z.string().trim().max(80), z.number().int()]).nullable().optional(),
    flashSaleQuantityLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    countdownLabel: z.string().trim().max(120).nullable().optional(),
    bannerTitle: z.string().trim().max(120).nullable().optional(),
    bannerMessage: z.string().trim().max(280).nullable().optional(),
    bannerColor: z.string().trim().max(32).optional(),
    pushNotificationEnabled: z.boolean().optional(),
  })
  .strict();

export const publishCampaignSchema = z
  .object({
    queueNotifications: z.boolean().optional(),
  })
  .strict();

function toCampaignInput(campaign: PromotionCampaign, patch?: Partial<PromotionCampaignInput>): PromotionCampaignInput {
  return {
    id: campaign.id,
    campaignCode: campaign.campaignCode,
    campaignName: campaign.campaignName,
    description: campaign.description,
    campaignType: campaign.campaignType,
    status: campaign.status,
    multiplier: campaign.multiplier,
    minimumPurchaseAmount: campaign.minimumPurchaseAmount,
    bonusPoints: campaign.bonusPoints,
    productScope: campaign.productScope,
    eligibleTiers: campaign.eligibleTiers,
    rewardId: campaign.rewardId,
    flashSaleQuantityLimit: campaign.flashSaleQuantityLimit,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    countdownLabel: campaign.countdownLabel,
    bannerTitle: campaign.bannerTitle,
    bannerMessage: campaign.bannerMessage,
    bannerColor: campaign.bannerColor,
    pushNotificationEnabled: campaign.pushNotificationEnabled,
    ...patch,
  };
}

function computeBudgetUtilizationPercent(campaign: PromotionCampaign, performance?: Awaited<ReturnType<typeof loadCampaignPerformance>>[number]) {
  if (performance?.quantityLimit && performance.quantityLimit > 0) {
    return Number((((performance.quantityClaimed || 0) / performance.quantityLimit) * 100).toFixed(1));
  }

  const notionalBudget = campaign.bonusPoints > 0 ? campaign.bonusPoints * 100 : 0;
  if (notionalBudget <= 0) return 0;
  return Number((Math.min(100, ((performance?.pointsAwarded || 0) / notionalBudget) * 100)).toFixed(1));
}

export const campaignsHandler = createApiHandler({
  route: "/api/campaigns",
  methods: ["POST"] as const,
  schema: campaignSchema,
  rateLimit: { limit: 20, windowMs: 60_000 },
  resolveActor: (body) => body.campaignCode,
  summarize: (body) => ({
    campaignCode: body.campaignCode,
    campaignName: body.campaignName,
    campaignType: body.campaignType,
  }),
  handler: async ({ body }) => {
    const campaign = await savePromotionCampaign(body);
    return { ok: true as const, campaign };
  },
});

export const publishCampaignHandler = createApiHandler({
  route: "/api/campaigns/:id/publish",
  methods: ["PATCH"] as const,
  schema: publishCampaignSchema,
  rateLimit: { limit: 20, windowMs: 60_000 },
  handler: async ({ body, req }) => {
    const campaignId = String(req.query.id || "").trim();
    if (!campaignId) throw new HttpError(400, "Campaign ID is required.");

    const campaigns = await loadPromotionCampaigns();
    const existing = campaigns.find((campaign: any) => campaign.id === campaignId);
    if (!existing) throw new HttpError(404, "Campaign not found.");

    const campaign = await savePromotionCampaign(toCampaignInput(existing as PromotionCampaign, { status: "active" }));
    const notificationsQueued = body.queueNotifications
      ? await queueCampaignNotifications(campaignId).catch(() => 0)
      : 0;

    return {
      ok: true as const,
      campaign,
      notificationsQueued,
    };
  },
});

export const activeCampaignsHandler = createApiHandler({
  route: "/api/campaigns/active",
  methods: ["GET"] as const,
  rateLimit: { limit: 60, windowMs: 60_000 },
  handler: async ({ req }) => {
    const tier = typeof req.query.tier === "string" ? req.query.tier.trim() : undefined;
    const [activeRes, performanceRes] = await Promise.all([
      loadActivePromotionCampaigns(tier),
      loadCampaignPerformance(),
    ]);
    const performanceById = new Map(
      (performanceRes || []).map((row: any) => [row.campaignId ?? row.campaign_id, row] as const),
    );
    const campaigns = activeRes || [];

    return {
      ok: true as const,
      campaigns: campaigns.map((campaign) => {
        const performance = performanceById.get(campaign.id);
        return {
          ...campaign,
          budgetUtilizationPercent: computeBudgetUtilizationPercent(campaign, performance),
          trackedTransactions: performance?.trackedTransactions ?? 0,
          pointsAwarded: performance?.pointsAwarded ?? 0,
          notificationsSent: performance?.notificationsSent ?? 0,
        };
      }),
    };
  },
});
