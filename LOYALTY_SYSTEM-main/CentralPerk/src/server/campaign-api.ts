import { z } from "zod";
import type { PromotionCampaign, PromotionCampaignInput } from "../app/lib/promotions";
import {
  listCampaigns,
  listActiveCampaigns,
  saveCampaign,
  loadCampaignPerformance,
  loadCampaignBudgetStatus,
  publishCampaign,
  queueCampaignNotifications,
} from "../app/lib/campaign-service-client";
import { HttpError } from "./http-error";
import { createApiHandler } from "./route-utils";
import {
  buildLocalBudgetStatus,
  getLatestLocalCampaign,
  getLocalCampaign,
  listLocalCampaigns,
  publishLocalCampaign,
  saveLocalCampaign,
} from "./local-campaigns";

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

const optionalBoolean = z
  .preprocess((value) => {
    if (typeof value !== "string") return value;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    return value;
  }, z.boolean())
  .optional();

function hasUnresolvedVariable(value: unknown) {
  return typeof value === "string" && (value.includes("{{") || value.includes("}}"));
}

function useLocalRuntimeFirst() {
  return (
    process.env.USE_REMOTE_LOYALTY_API !== "true" &&
    (process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true" || process.env.USE_LOCAL_LOYALTY_API === "true")
  );
}

async function resolveCampaignId(rawId: unknown) {
  const campaignId = String(rawId || "").trim();
  if (campaignId && !hasUnresolvedVariable(campaignId)) return campaignId;
  const latest = await getLatestLocalCampaign();
  if (latest?.id) return latest.id;
  throw new HttpError(400, "Campaign ID is required. Create a campaign first or set campaignId in your request environment.");
}

export const campaignSchema = z
  .object({
    id: z.string().trim().max(80).optional(),
    campaignCode: z.string().trim().min(1).max(80),
    campaignName: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    campaignType: z.enum(["bonus_points", "flash_sale", "multiplier_event"]),
    status: z.enum(["draft", "scheduled", "active", "paused", "completed", "archived"]).optional(),
    multiplier: z.coerce.number().min(0).max(100).optional(),
    minimumPurchaseAmount: z.coerce.number().min(0).max(10_000_000).optional(),
    bonusPoints: z.coerce.number().int().min(0).max(1_000_000).optional(),
    productScope: stringListFromCsv,
    eligibleTiers: stringListFromCsv,
    rewardId: z.union([z.string().trim().max(80), z.number().int()]).nullable().optional(),
    flashSaleQuantityLimit: z.coerce.number().int().min(1).max(1_000_000).nullable().optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    countdownLabel: z.string().trim().max(120).nullable().optional(),
    bannerTitle: z.string().trim().max(120).nullable().optional(),
    bannerMessage: z.string().trim().max(280).nullable().optional(),
    bannerColor: z.string().trim().max(32).optional(),
    pushNotificationEnabled: optionalBoolean,
    budgetLimit: z.coerce.number().min(0).max(1_000_000_000).nullable().optional(),
    autoPause: optionalBoolean,
  })
  .strict();

export const publishCampaignSchema = z
  .object({
    queueNotifications: optionalBoolean,
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
    budgetLimit: (campaign as any).budgetLimit ?? (campaign as any).budget_limit ?? undefined,
    autoPause: (campaign as any).autoPause ?? (campaign as any).auto_pause ?? undefined,
    ...patch,
  };
}

function performanceCampaignId(row: any) {
  return String(row?.campaign_id ?? row?.campaignId ?? row?.id ?? "");
}

function computeBudgetUtilizationPercent(campaign: PromotionCampaign, performance?: any) {
  const budgetLimit = Number((campaign as any).budgetLimit ?? (campaign as any).budget_limit ?? 0);
  const budgetSpent = Number((campaign as any).budgetSpent ?? (campaign as any).budget_spent ?? performance?.pointsAwarded ?? 0);
  if (budgetLimit > 0) {
    return Number(Math.min(100, (budgetSpent / budgetLimit) * 100).toFixed(1));
  }

  if (performance?.quantityLimit && performance.quantityLimit > 0) {
    return Number((((performance.quantityClaimed || 0) / performance.quantityLimit) * 100).toFixed(1));
  }

  const notionalBudget = campaign.bonusPoints > 0 ? campaign.bonusPoints * 100 : 0;
  if (notionalBudget <= 0) return 0;
  return Number((Math.min(100, ((performance?.pointsAwarded || 0) / notionalBudget) * 100)).toFixed(1));
}

function buildBudgetStatus(campaign: PromotionCampaign, performance?: any) {
  const budgetLimitRaw = (campaign as any).budgetLimit ?? (campaign as any).budget_limit ?? null;
  const budgetLimit = budgetLimitRaw === null || budgetLimitRaw === undefined ? null : Number(budgetLimitRaw);
  const budgetSpent = Number((campaign as any).budgetSpent ?? (campaign as any).budget_spent ?? performance?.pointsAwarded ?? 0);
  const now = Date.now();
  const startsAt = new Date(campaign.startsAt).getTime();
  const endsAt = new Date(campaign.endsAt).getTime();
  const active =
    campaign.status === "active" &&
    startsAt <= now &&
    endsAt >= now &&
    (budgetLimit === null || budgetSpent < budgetLimit);

  return {
    campaignId: campaign.id,
    campaignName: campaign.campaignName,
    status: campaign.status,
    active,
    budgetLimit,
    budgetSpent,
    budgetRemaining: budgetLimit === null ? null : Math.max(0, budgetLimit - budgetSpent),
    utilizationPercent: computeBudgetUtilizationPercent(campaign, performance),
    trackedTransactions: Number(performance?.trackedTransactions ?? 0),
    pointsAwarded: Number(performance?.pointsAwarded ?? budgetSpent ?? 0),
    notificationsSent: Number(performance?.notificationsSent ?? 0),
    redemptionCount: Number(performance?.redemptionCount ?? 0),
    quantityLimit: performance?.quantityLimit ?? campaign.flashSaleQuantityLimit ?? null,
    quantityClaimed: Number(performance?.quantityClaimed ?? campaign.flashSaleClaimedCount ?? 0),
    sellThrough: performance?.sellThrough ?? null,
  };
}

function buildLocalPerformanceRows(campaigns: any[]) {
  return campaigns.map((campaign) => ({
    campaign_id: String(campaign.id),
    campaign_code: String(campaign.campaignCode ?? campaign.campaign_code ?? ""),
    campaign_name: String(campaign.campaignName ?? campaign.campaign_name ?? "Campaign"),
    campaign_type: String(campaign.campaignType ?? campaign.campaign_type ?? "bonus_points"),
    status: String(campaign.status ?? "draft"),
    starts_at: String(campaign.startsAt ?? campaign.starts_at ?? campaign.createdAt ?? new Date().toISOString()),
    ends_at: String(campaign.endsAt ?? campaign.ends_at ?? new Date().toISOString()),
    notifications_sent: Number(campaign.notificationsSent ?? campaign.notifications_sent ?? 0),
    tracked_transactions: Number(campaign.trackedTransactions ?? campaign.tracked_transactions ?? 0),
    points_awarded: Number(campaign.budgetSpent ?? campaign.budget_spent ?? 0),
    redemption_count: Number(campaign.redemptionCount ?? campaign.redemption_count ?? 0),
    quantity_limit: campaign.flashSaleQuantityLimit ?? campaign.flash_sale_quantity_limit ?? null,
    quantity_claimed: Number(campaign.flashSaleClaimedCount ?? campaign.flash_sale_claimed_count ?? 0),
    sell_through: null,
    redemption_speed_per_hour: 0,
  }));
}

export const campaignsHandler = createApiHandler({
  route: "/api/campaigns",
  methods: ["POST"] as const,
  schema: campaignSchema,
  parseBodyFromQuery: true,
  rateLimit: { limit: 20, windowMs: 60_000 },
  resolveActor: (body) => body.campaignCode,
  summarize: (body) => ({
    campaignCode: body.campaignCode,
    campaignName: body.campaignName,
    campaignType: body.campaignType,
  }),
  handler: async ({ body }) => {
    if (useLocalRuntimeFirst()) {
      const campaign = await saveLocalCampaign(body);
      return { ok: true as const, campaign, campaignId: campaign.id };
    }

    const response = await saveCampaign(body).catch(async () => ({
      ok: true,
      campaign: await saveLocalCampaign(body),
    }));
    if (!response.ok) throw new HttpError(502, "Campaign service save failed");
    return { ok: true as const, campaign: response.campaign, campaignId: response.campaign.id };
  },
});

export const campaignsListHandler = createApiHandler({
  route: "/api/campaigns",
  methods: ["GET"] as const,
  rateLimit: { limit: 60, windowMs: 60_000 },
  handler: async () => {
    if (useLocalRuntimeFirst()) {
      return { ok: true as const, campaigns: await listLocalCampaigns(), source: "local_runtime" };
    }

    const response = await listCampaigns().catch(async () => ({
      ok: true,
      campaigns: await listLocalCampaigns(),
      source: "local_fallback",
    }));
    if (!response.ok) throw new HttpError(502, "Campaign service list failed");
    return { ok: true as const, campaigns: response.campaigns || [], source: (response as any).source ?? "service" };
  },
});

export const campaignPerformanceHandler = createApiHandler({
  route: "/api/campaigns/performance",
  methods: ["GET"] as const,
  rateLimit: { limit: 60, windowMs: 60_000 },
  handler: async () => {
    if (useLocalRuntimeFirst()) {
      const campaigns = await listLocalCampaigns();
      return { ok: true as const, performance: buildLocalPerformanceRows(campaigns), source: "local_runtime" };
    }

    const response = await loadCampaignPerformance().catch(async () => ({
      ok: true,
      performance: buildLocalPerformanceRows(await listLocalCampaigns()),
      source: "local_fallback",
    }));
    if (!response.ok) throw new HttpError(502, "Campaign service performance failed");
    return { ok: true as const, performance: response.performance || [], source: (response as any).source ?? "service" };
  },
});

export const campaignByIdHandler = createApiHandler({
  route: "/api/campaigns/:id",
  methods: ["GET"] as const,
  rateLimit: { limit: 60, windowMs: 60_000 },
  handler: async ({ req }) => {
    const campaignId = await resolveCampaignId(req.query.id);

    if (useLocalRuntimeFirst()) {
      const campaign = await getLocalCampaign(campaignId);
      if (!campaign) throw new HttpError(404, "Campaign not found.");
      return { ok: true as const, campaign, campaignId: campaign.id };
    }

    const campaignsRes = await listCampaigns().catch(async () => ({
      ok: true,
      campaigns: await listLocalCampaigns(),
    }));
    if (!campaignsRes.ok) throw new HttpError(502, "Campaign service list failed");
    const campaign = (campaignsRes.campaigns || []).find((item: any) => String(item.id) === campaignId);
    if (!campaign) throw new HttpError(404, "Campaign not found.");

    return {
      ok: true as const,
      campaign,
      campaignId: campaign.id,
    };
  },
});

export const publishCampaignHandler = createApiHandler({
  route: "/api/campaigns/:id/publish",
  methods: ["PATCH"] as const,
  schema: publishCampaignSchema,
  parseBodyFromQuery: true,
  rateLimit: { limit: 20, windowMs: 60_000 },
  handler: async ({ body, req }) => {
    const campaignId = await resolveCampaignId(req.query.id);

    if (useLocalRuntimeFirst()) {
      const campaign = await publishLocalCampaign(campaignId);
      if (!campaign) throw new HttpError(404, "Campaign not found.");
      return {
        ok: true as const,
        campaign,
        campaignId: campaign.id,
        notificationsQueued: 0,
      };
    }

    const directPublish = await publishCampaign(campaignId, {
      queueNotifications: body.queueNotifications ?? false,
    }).catch(() => null);
    if (directPublish?.ok) {
      return {
        ok: true as const,
        campaign: directPublish.campaign,
        campaignId: directPublish.campaign.id,
        notificationsQueued: directPublish.notificationsQueued ?? 0,
      };
    }

    const campaignsRes = await listCampaigns().catch(async () => ({
      ok: true,
      campaigns: await listLocalCampaigns(),
    }));
    if (!campaignsRes.ok) throw new HttpError(502, "Campaign service list failed");
    const existing = (campaignsRes.campaigns || []).find((campaign: any) => campaign.id === campaignId);
    if (!existing) throw new HttpError(404, "Campaign not found.");

    const localPublished = await publishLocalCampaign(campaignId);
    const response = localPublished
      ? { ok: true, campaign: localPublished }
      : await saveCampaign(toCampaignInput(existing as PromotionCampaign, { status: "active" }));
    if (!response.ok) throw new HttpError(502, "Campaign service publish failed");
    const notificationsQueued = body.queueNotifications
      ? await queueCampaignNotifications(campaignId).then((r) => (r.ok ? r.notificationsQueued : 0)).catch(() => 0)
      : 0;

    return {
      ok: true as const,
      campaign: response.campaign,
      campaignId: response.campaign.id,
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
    if (useLocalRuntimeFirst()) {
      const localCampaigns = await listLocalCampaigns();
      const now = Date.now();
      const campaigns = localCampaigns.filter((campaign) => {
        const startsAt = new Date(campaign.startsAt || campaign.createdAt).getTime();
        const endsAt = new Date(campaign.endsAt || "2999-12-31T23:59:59.000Z").getTime();
        const eligibleTiers = campaign.eligibleTiers ?? campaign.eligible_tiers ?? [];
        return (
          campaign.status === "active" &&
          startsAt <= now &&
          endsAt >= now &&
          (!tier ||
            !Array.isArray(eligibleTiers) ||
            eligibleTiers.length === 0 ||
            eligibleTiers.some((entry: string) => String(entry).toLowerCase() === tier.toLowerCase()))
        );
      });

      return {
        ok: true as const,
        campaigns: campaigns.map((campaign) => ({
          ...campaign,
          budgetUtilizationPercent: computeBudgetUtilizationPercent(campaign as unknown as PromotionCampaign),
          trackedTransactions: 0,
          pointsAwarded: Number(campaign.budgetSpent ?? 0),
          notificationsSent: 0,
        })),
      };
    }

    const [activeRes, performanceRes] = await Promise.all([
      listActiveCampaigns().catch(async () => ({
        ok: true,
        campaigns: (await listLocalCampaigns()).filter((campaign) => campaign.status === "active"),
      })),
      loadCampaignPerformance().catch(() => ({ ok: true, performance: [] })),
    ]);
    if (!activeRes.ok) throw new HttpError(502, "Campaign service active failed");
    if (!performanceRes.ok) throw new HttpError(502, "Campaign service performance failed");
    const performanceById = new Map(
      (performanceRes.performance || []).map((row: any) => [performanceCampaignId(row), row] as const),
    );
    const campaigns = (activeRes.campaigns || []).filter((campaign: any) => {
      if (!tier) return true;
      return (
        !campaign.eligible_tiers ||
        campaign.eligible_tiers.length === 0 ||
        campaign.eligible_tiers.some((entry: string) => entry.toLowerCase() === tier.toLowerCase())
      );
    });

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

export const campaignBudgetStatusHandler = createApiHandler({
  route: "/api/campaigns/:id/budget-status",
  methods: ["GET"] as const,
  rateLimit: { limit: 60, windowMs: 60_000 },
  handler: async ({ req }) => {
    const campaignId = await resolveCampaignId(req.query.id);

    if (useLocalRuntimeFirst()) {
      const campaign = await getLocalCampaign(campaignId);
      if (!campaign) throw new HttpError(404, "Campaign not found.");
      return {
        ok: true as const,
        budgetStatus: buildLocalBudgetStatus(campaign),
        campaignId: campaign.id,
      };
    }

    const directStatus = await loadCampaignBudgetStatus(campaignId).catch(() => null);
    if (directStatus?.ok) {
      return {
        ok: true as const,
        budgetStatus: directStatus.budgetStatus,
      };
    }

    const [campaignsRes, performanceRes] = await Promise.all([
      listCampaigns().catch(async () => ({
        ok: true,
        campaigns: await listLocalCampaigns(),
      })),
      loadCampaignPerformance().catch(() => ({ ok: true, performance: [] })),
    ]);
    if (!campaignsRes.ok) throw new HttpError(502, "Campaign service list failed");
    if (!performanceRes.ok) throw new HttpError(502, "Campaign service performance failed");

    const campaign = (campaignsRes.campaigns || []).find((item: any) => String(item.id) === campaignId);
    if (!campaign) {
      const localCampaign = await getLocalCampaign(campaignId);
      if (!localCampaign) throw new HttpError(404, "Campaign not found.");
      return {
        ok: true as const,
        budgetStatus: buildLocalBudgetStatus(localCampaign),
      };
    }

    const performance = (performanceRes.performance || []).find((row: any) => performanceCampaignId(row) === campaignId);
    return {
      ok: true as const,
      budgetStatus: buildBudgetStatus(campaign as PromotionCampaign, performance),
    };
  },
});
