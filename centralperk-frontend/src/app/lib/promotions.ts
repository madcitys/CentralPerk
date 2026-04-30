import {
  listCampaigns as serviceListCampaigns,
  listActiveCampaigns as serviceListActiveCampaigns,
  saveCampaign as serviceSaveCampaign,
  loadCampaignPerformance as serviceLoadPerformance,
  queueCampaignNotifications as serviceQueueNotifications,
} from "./campaign-service-client";
import { supabase } from "../../utils/supabase/client";

type AnyRecord = Record<string, any>;

export type PromotionCampaignType = "bonus_points" | "flash_sale" | "multiplier_event";

export type PromotionCampaignStatus = "draft" | "scheduled" | "active" | "paused" | "completed" | "archived";

export type PromotionCampaign = {
  id: string;
  campaignCode: string;
  campaignName: string;
  description: string;
  campaignType: PromotionCampaignType;
  status: PromotionCampaignStatus;
  multiplier: number;
  minimumPurchaseAmount: number;
  bonusPoints: number;
  productScope: string[];
  eligibleTiers: string[];
  rewardId: string | null;
  rewardName: string | null;
  rewardPointsCost: number | null;
  rewardImageUrl: string | null;
  flashSaleQuantityLimit: number | null;
  flashSaleClaimedCount: number;
  startsAt: string;
  endsAt: string;
  countdownLabel: string | null;
  bannerTitle: string | null;
  bannerMessage: string | null;
  bannerColor: string;
  pushNotificationEnabled: boolean;
  budgetLimit?: number | null;
  budgetSpent?: number;
  autoPause?: boolean;
};

export type PromotionCampaignInput = {
  id?: string;
  campaignCode: string;
  campaignName: string;
  description?: string;
  campaignType: PromotionCampaignType;
  status?: PromotionCampaignStatus;
  multiplier?: number;
  minimumPurchaseAmount?: number;
  bonusPoints?: number;
  productScope?: string[];
  eligibleTiers?: string[];
  rewardId?: string | number | null;
  flashSaleQuantityLimit?: number | null;
  startsAt: string;
  endsAt: string;
  countdownLabel?: string | null;
  bannerTitle?: string | null;
  bannerMessage?: string | null;
  bannerColor?: string;
  pushNotificationEnabled?: boolean;
  budgetLimit?: number | null;
  autoPause?: boolean;
};

export type CampaignPerformance = {
  campaignId: string;
  campaignCode: string;
  campaignName: string;
  campaignType: PromotionCampaignType;
  status: PromotionCampaignStatus;
  startsAt: string;
  endsAt: string;
  notificationsSent: number;
  trackedTransactions: number;
  pointsAwarded: number;
  redemptionCount: number;
  quantityLimit: number | null;
  quantityClaimed: number;
  sellThrough: number | null;
  redemptionSpeedPerHour: number;
};

export type RewardPartner = {
  id: string;
  partnerCode: string;
  partnerName: string;
  description: string | null;
  logoUrl: string | null;
  conversionRate: number;
  isActive: boolean;
};

export type RewardPartnerInput = {
  id?: string;
  partnerCode: string;
  partnerName: string;
  description?: string | null;
  logoUrl?: string | null;
  conversionRate?: number;
  isActive?: boolean;
};

export type RewardPartnerPerformance = RewardPartner & {
  rewardsCount: number;
  redemptionCount: number;
  uniqueRedeemers: number;
  pointsRedeemed: number;
};

export type MemberBadgeProgress = {
  badgeId: string;
  badgeCode: string;
  badgeName: string;
  description: string;
  iconName: string;
  milestoneType: string;
  milestoneTarget: number;
  progressValue: number;
  isEarned: boolean;
  earnedAt: string | null;
};

export type BadgeLeaderboardEntry = {
  memberId: string;
  memberNumber: string;
  memberName: string;
  badgeCount: number;
};

function normalizeCampaign(row: AnyRecord): PromotionCampaign {
  const reward = row.rewards_catalog as AnyRecord | null;

  return {
    id: String(row.id ?? ""),
    campaignCode: String(row.campaignCode ?? row.campaign_code ?? ""),
    campaignName: String(row.campaignName ?? row.campaign_name ?? "Campaign"),
    description: String(row.description ?? ""),
    campaignType: String(row.campaignType ?? row.campaign_type ?? "bonus_points") as PromotionCampaignType,
    status: String(row.status ?? "scheduled") as PromotionCampaignStatus,
    multiplier: Number(row.multiplier ?? 1),
    minimumPurchaseAmount: Number(row.minimumPurchaseAmount ?? row.minimum_purchase_amount ?? 0),
    bonusPoints: Number(row.bonusPoints ?? row.bonus_points ?? 0),
    productScope: Array.isArray(row.productScope ?? row.product_scope)
      ? (row.productScope ?? row.product_scope).map((entry: unknown) => String(entry))
      : [],
    eligibleTiers: Array.isArray(row.eligibleTiers ?? row.eligible_tiers)
      ? (row.eligibleTiers ?? row.eligible_tiers).map((entry: unknown) => String(entry))
      : [],
    rewardId: row.rewardId !== undefined && row.rewardId !== null ? String(row.rewardId) : reward?.reward_id ? String(reward.reward_id) : null,
    rewardName: reward?.name ? String(reward.name) : null,
    rewardPointsCost: reward?.points_cost !== undefined ? Number(reward.points_cost ?? 0) : null,
    rewardImageUrl: reward?.image_url ? String(reward.image_url) : null,
    flashSaleQuantityLimit:
      (row.flashSaleQuantityLimit ?? row.flash_sale_quantity_limit) === null ||
      (row.flashSaleQuantityLimit ?? row.flash_sale_quantity_limit) === undefined
        ? null
        : Number(row.flashSaleQuantityLimit ?? row.flash_sale_quantity_limit),
    flashSaleClaimedCount: Number(row.flashSaleClaimedCount ?? row.flash_sale_claimed_count ?? 0),
    startsAt: String(row.startsAt ?? row.starts_at ?? new Date().toISOString()),
    endsAt: String(row.endsAt ?? row.ends_at ?? new Date().toISOString()),
    countdownLabel: row.countdownLabel ?? row.countdown_label ? String(row.countdownLabel ?? row.countdown_label) : null,
    bannerTitle: row.bannerTitle ?? row.banner_title ? String(row.bannerTitle ?? row.banner_title) : null,
    bannerMessage: row.bannerMessage ?? row.banner_message ? String(row.bannerMessage ?? row.banner_message) : null,
    bannerColor: String(row.bannerColor ?? row.banner_color ?? "#1A2B47"),
    pushNotificationEnabled: Boolean(row.pushNotificationEnabled ?? row.push_notification_enabled ?? false),
    budgetLimit:
      row.budgetLimit === null || row.budget_limit === null
        ? null
        : row.budgetLimit !== undefined || row.budget_limit !== undefined
          ? Number(row.budgetLimit ?? row.budget_limit)
          : undefined,
    budgetSpent: row.budgetSpent !== undefined || row.budget_spent !== undefined ? Number(row.budgetSpent ?? row.budget_spent) : undefined,
    autoPause: row.autoPause ?? row.auto_pause,
  };
}

function normalizePartner(row: AnyRecord): RewardPartner {
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

async function lookupMemberId(_memberIdentifier?: string, _fallbackEmail?: string) {
  return null;
}

function useLocalPromotionFallback() {
  return (
    process.env.NEXT_PUBLIC_USE_REMOTE_LOYALTY_API !== "true" &&
    (process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true" ||
      process.env.NEXT_PUBLIC_USE_LOCAL_LOYALTY_API === "true" ||
      process.env.USE_LOCAL_LOYALTY_API === "true")
  );
}

const PROMOTION_READ_CACHE_TTL_MS = 20_000;
const promotionReadCache = new Map<string, { loadedAt: number; value: unknown }>();
const promotionReadInFlight = new Map<string, Promise<unknown>>();

async function withPromotionReadCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const cached = promotionReadCache.get(key);
  if (cached && Date.now() - cached.loadedAt < PROMOTION_READ_CACHE_TTL_MS) {
    return cached.value as T;
  }

  const inFlight = promotionReadInFlight.get(key);
  if (inFlight) return inFlight as Promise<T>;

  const request = loader()
    .then((value) => {
      promotionReadCache.set(key, { loadedAt: Date.now(), value });
      return value;
    })
    .finally(() => {
      promotionReadInFlight.delete(key);
    });

  promotionReadInFlight.set(key, request);
  return request;
}

function clearPromotionReadCache(prefix?: string) {
  if (!prefix) {
    promotionReadCache.clear();
    promotionReadInFlight.clear();
    return;
  }

  for (const key of Array.from(promotionReadCache.keys())) {
    if (key.startsWith(prefix)) promotionReadCache.delete(key);
  }
  for (const key of Array.from(promotionReadInFlight.keys())) {
    if (key.startsWith(prefix)) promotionReadInFlight.delete(key);
  }
}

export async function loadPromotionCampaigns(): Promise<PromotionCampaign[]> {
  return withPromotionReadCache("campaigns:all", async () => {
    const response = await serviceListCampaigns();
    if (!response.ok) throw new Error("Campaign service list failed");
    return (response.campaigns || []).map((row) => normalizeCampaign(row as AnyRecord));
  });
}

export async function loadActivePromotionCampaigns(memberTier?: string): Promise<PromotionCampaign[]> {
  const cacheKey = `campaigns:active:${String(memberTier || "").toLowerCase()}`;
  return withPromotionReadCache(cacheKey, async () => {
    const response = await serviceListActiveCampaigns();
    if (!response.ok) throw new Error("Campaign service active list failed");
    const campaigns = (response.campaigns || []).map((row) => normalizeCampaign(row as AnyRecord));
    if (!memberTier) return campaigns;
    return campaigns.filter(
      (c) =>
        c.eligibleTiers.length === 0 ||
        c.eligibleTiers.some((entry) => entry.toLowerCase() === memberTier.toLowerCase())
    );
  });
}

export async function savePromotionCampaign(input: PromotionCampaignInput) {
  const response = await serviceSaveCampaign(input);
  if (!response.ok) throw new Error("Campaign service save failed");
  clearPromotionReadCache("campaigns:");
  clearPromotionReadCache("campaign-performance");
  return normalizeCampaign(response.campaign as AnyRecord);
}

export async function queueCampaignNotifications(campaignId: string) {
  const response = await serviceQueueNotifications(campaignId);
  if (!response.ok) throw new Error("Campaign service notify failed");
  clearPromotionReadCache("campaign-performance");
  return response.notificationsQueued;
}

export async function loadCampaignPerformance(): Promise<CampaignPerformance[]> {
  return withPromotionReadCache("campaign-performance", async () => {
    const response = await serviceLoadPerformance();
    if (!response.ok) throw new Error("Campaign service performance failed");

    return ((response.performance || []) as AnyRecord[]).map((row) => ({
      campaignId: String(row.campaign_id ?? ""),
      campaignCode: String(row.campaign_code ?? ""),
      campaignName: String(row.campaign_name ?? ""),
      campaignType: String(row.campaign_type ?? "bonus_points") as PromotionCampaignType,
      status: String(row.status ?? "scheduled") as PromotionCampaignStatus,
      startsAt: String(row.starts_at ?? new Date().toISOString()),
      endsAt: String(row.ends_at ?? new Date().toISOString()),
      notificationsSent: Number(row.notifications_sent ?? 0),
      trackedTransactions: Number(row.tracked_transactions ?? 0),
      pointsAwarded: Number(row.points_awarded ?? 0),
      redemptionCount: Number(row.redemption_count ?? 0),
      quantityLimit:
        row.quantity_limit === null || row.quantity_limit === undefined ? null : Number(row.quantity_limit),
      quantityClaimed: Number(row.quantity_claimed ?? 0),
      sellThrough: row.sell_through === null || row.sell_through === undefined ? null : Number(row.sell_through),
      redemptionSpeedPerHour: Number(row.redemption_speed_per_hour ?? 0),
    }));
  });
}

export async function loadRewardPartners(): Promise<RewardPartner[]> {
  if (useLocalPromotionFallback()) return [];
  return withPromotionReadCache("partners:list", async () => {
    const { data, error } = await supabase
      .from("reward_partners")
      .select("*")
      .order("partner_name", { ascending: true });

    if (error) throw error;
    return (data || []).map((row) => normalizePartner(row as AnyRecord));
  });
}

export async function saveRewardPartner(input: RewardPartnerInput) {
  const payload = {
    partner_code: input.partnerCode.trim().toUpperCase(),
    partner_name: input.partnerName.trim(),
    description: input.description?.trim() || null,
    logo_url: input.logoUrl?.trim() || null,
    conversion_rate: Math.max(0.01, Number(input.conversionRate ?? 1)),
    is_active: Boolean(input.isActive ?? true),
  };

  const query = input.id
    ? supabase.from("reward_partners").update(payload).eq("id", input.id).select("*").single()
    : supabase.from("reward_partners").insert(payload).select("*").single();

  const { data, error } = await query;
  if (error) throw error;
  clearPromotionReadCache("partners:");
  return normalizePartner(data as AnyRecord);
}

export async function toggleRewardPartner(partnerId: string, isActive: boolean) {
  const { data, error } = await supabase
    .from("reward_partners")
    .update({ is_active: isActive })
    .eq("id", partnerId)
    .select("*")
    .single();

  if (error) throw error;
  clearPromotionReadCache("partners:");
  return normalizePartner(data as AnyRecord);
}

export async function loadPartnerPerformance(): Promise<RewardPartnerPerformance[]> {
  if (useLocalPromotionFallback()) return [];
  return withPromotionReadCache("partners:performance", async () => {
    const { data, error } = await supabase.rpc("loyalty_partner_reward_performance");
    if (error) throw error;

    return ((data || []) as AnyRecord[]).map((row) => ({
      id: String(row.partner_id ?? ""),
      partnerCode: String(row.partner_code ?? ""),
      partnerName: String(row.partner_name ?? ""),
      description: null,
      logoUrl: null,
      conversionRate: 1,
      isActive: true,
      rewardsCount: Number(row.rewards_count ?? 0),
      redemptionCount: Number(row.redemption_count ?? 0),
      uniqueRedeemers: Number(row.unique_redeemers ?? 0),
      pointsRedeemed: Number(row.points_redeemed ?? 0),
    }));
  });
}

export async function loadMemberBadgeProgress(memberIdentifier?: string, fallbackEmail?: string) {
  if (useLocalPromotionFallback()) return [] as MemberBadgeProgress[];

  const memberId = await lookupMemberId(memberIdentifier, fallbackEmail);
  if (!memberId) return [] as MemberBadgeProgress[];

  const { data, error } = await supabase.rpc("loyalty_member_badge_progress", {
    p_member_id: memberId,
  });

  if (error) throw error;

  return ((data || []) as AnyRecord[]).map((row) => ({
    badgeId: String(row.badge_id ?? ""),
    badgeCode: String(row.badge_code ?? ""),
    badgeName: String(row.badge_name ?? ""),
    description: String(row.description ?? ""),
    iconName: String(row.icon_name ?? "Award"),
    milestoneType: String(row.milestone_type ?? ""),
    milestoneTarget: Number(row.milestone_target ?? 0),
    progressValue: Number(row.progress_value ?? 0),
    isEarned: Boolean(row.is_earned ?? false),
    earnedAt: row.earned_at ? String(row.earned_at) : null,
  }));
}

export async function loadBadgeLeaderboard(limit = 10) {
  if (useLocalPromotionFallback()) return [] as BadgeLeaderboardEntry[];

  const { data, error } = await supabase.rpc("loyalty_badge_leaderboard", { p_limit: limit });
  if (error) throw error;

  return ((data || []) as AnyRecord[]).map((row) => ({
    memberId: String(row.member_id ?? ""),
    memberNumber: String(row.member_number ?? ""),
    memberName: String(row.member_name ?? ""),
    badgeCount: Number(row.badge_count ?? 0),
  })) as BadgeLeaderboardEntry[];
}
