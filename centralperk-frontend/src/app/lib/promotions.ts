import { requestJson } from "./api";
import { loadBadgeLeaderboardViaApi, loadBadgeProgressViaApi } from "./member-service-api";

type AnyRecord = Record<string, any>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PromotionCampaignType = "bonus_points" | "flash_sale" | "multiplier_event";

export type PromotionCampaignStatus = "draft" | "scheduled" | "active" | "completed" | "archived";

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

function createStatusError(message: string, statusCode: number) {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  return error;
}

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
    rewardName: row.rewardName ? String(row.rewardName) : reward?.name ? String(reward.name) : null,
    rewardPointsCost: row.rewardPointsCost !== undefined ? Number(row.rewardPointsCost ?? 0) : reward?.points_cost !== undefined ? Number(reward.points_cost ?? 0) : null,
    rewardImageUrl: row.rewardImageUrl ? String(row.rewardImageUrl) : reward?.image_url ? String(reward.image_url) : null,
    flashSaleQuantityLimit:
      (row.flashSaleQuantityLimit ?? row.flash_sale_quantity_limit) === null || (row.flashSaleQuantityLimit ?? row.flash_sale_quantity_limit) === undefined
        ? null
        : Number(row.flashSaleQuantityLimit ?? row.flash_sale_quantity_limit),
    flashSaleClaimedCount: Number(row.flashSaleClaimedCount ?? row.flash_sale_claimed_count ?? 0),
    startsAt: String(row.startsAt ?? row.starts_at ?? new Date().toISOString()),
    endsAt: String(row.endsAt ?? row.ends_at ?? new Date().toISOString()),
    countdownLabel: row.countdownLabel ? String(row.countdownLabel) : row.countdown_label ? String(row.countdown_label) : null,
    bannerTitle: row.bannerTitle ? String(row.bannerTitle) : row.banner_title ? String(row.banner_title) : null,
    bannerMessage: row.bannerMessage ? String(row.bannerMessage) : row.banner_message ? String(row.banner_message) : null,
    bannerColor: String(row.bannerColor ?? row.banner_color ?? "#1A2B47"),
    pushNotificationEnabled: Boolean(row.pushNotificationEnabled ?? row.push_notification_enabled ?? false),
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

export async function resolvePromotionCampaignId(reference: string) {
  const trimmedReference = reference.trim();
  if (!trimmedReference) return null;

  const campaigns = await loadPromotionCampaigns();
  const match = campaigns.find((campaign) =>
    UUID_PATTERN.test(trimmedReference)
      ? campaign.id === trimmedReference
      : campaign.campaignCode.toLowerCase() === trimmedReference.toLowerCase()
  );
  return match?.id ?? null;
}

export async function loadPromotionCampaigns(): Promise<PromotionCampaign[]> {
  const response = await requestJson<{ ok: true; campaigns: AnyRecord[] }>("/api/campaigns");
  return (response.campaigns || []).map((row) => normalizeCampaign(row as AnyRecord));
}

export async function loadActivePromotionCampaigns(memberTier?: string): Promise<PromotionCampaign[]> {
  const all = await loadPromotionCampaigns();
  const now = Date.now();

  return all.filter((campaign) => {
    const startsAt = new Date(campaign.startsAt).getTime();
    const endsAt = new Date(campaign.endsAt).getTime();
    const isWindowOpen = startsAt <= now && endsAt >= now;
    const tierAllowed =
      !memberTier ||
      campaign.eligibleTiers.length === 0 ||
      campaign.eligibleTiers.some((entry) => entry.toLowerCase() === memberTier.toLowerCase());

    return isWindowOpen && tierAllowed && campaign.status !== "archived";
  });
}

export async function savePromotionCampaign(input: PromotionCampaignInput) {
  const response = await requestJson<{ ok: true; campaign: AnyRecord }>("/api/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return normalizeCampaign(response.campaign as AnyRecord);
}

export async function queueCampaignNotifications(campaignId: string) {
  const resolvedCampaignId = await resolvePromotionCampaignId(campaignId);
  if (!resolvedCampaignId) {
    const error = new Error("Campaign not found.");
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }

  const response = await requestJson<{ ok: true; notificationsQueued: number }>("/api/campaigns/notifications/queue", {
    method: "POST",
    body: JSON.stringify({ campaignId: resolvedCampaignId }),
  });
  return Number(response.notificationsQueued || 0);
}

export async function claimFlashSaleCampaign(campaignReference: string) {
  const resolvedCampaignId = await resolvePromotionCampaignId(campaignReference);
  if (!resolvedCampaignId) {
    throw createStatusError("Campaign not found.", 404);
  }

  const response = await requestJson<{ ok: true; claim: AnyRecord }>("/api/campaigns/flash-sale/claim", {
    method: "POST",
    body: JSON.stringify({ campaignId: resolvedCampaignId }),
  });
  return response.claim;
}

export async function loadCampaignPerformance(): Promise<CampaignPerformance[]> {
  const response = await requestJson<{ ok: true; performance: AnyRecord[] }>("/api/campaigns/performance");
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
}

export async function loadRewardPartners(): Promise<RewardPartner[]> {
  const response = await requestJson<{ ok: true; partners: AnyRecord[] }>("/api/reward-partners");
  return (response.partners || []).map((row) => normalizePartner(row as AnyRecord));
}

export async function saveRewardPartner(input: RewardPartnerInput) {
  const response = await requestJson<{ ok: true; partner: AnyRecord }>("/api/reward-partners", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return normalizePartner(response.partner as AnyRecord);
}

export async function toggleRewardPartner(partnerId: string, isActive: boolean) {
  const response = await requestJson<{ ok: true; partner: AnyRecord }>(`/api/reward-partners/${encodeURIComponent(partnerId)}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
  return normalizePartner(response.partner as AnyRecord);
}

export async function loadPartnerPerformance(): Promise<RewardPartnerPerformance[]> {
  const response = await requestJson<{ ok: true; performance: AnyRecord[] }>("/api/reward-partners/performance");
  return ((response.performance || []) as AnyRecord[]).map((row) => ({
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
}

export async function loadMemberBadgeProgress(memberIdentifier?: string, fallbackEmail?: string) {
  if (!memberIdentifier && !fallbackEmail) return [] as MemberBadgeProgress[];
  return (await loadBadgeProgressViaApi(memberIdentifier, fallbackEmail)).map((row) => ({
    badgeId: String(row.badgeId ?? row.badge_id ?? ""),
    badgeCode: String(row.badgeCode ?? row.badge_code ?? ""),
    badgeName: String(row.badgeName ?? row.badge_name ?? ""),
    description: String(row.description ?? ""),
    iconName: String(row.iconName ?? row.icon_name ?? "Award"),
    milestoneType: String(row.milestoneType ?? row.milestone_type ?? ""),
    milestoneTarget: Number(row.milestoneTarget ?? row.milestone_target ?? 0),
    progressValue: Number(row.progressValue ?? row.progress_value ?? 0),
    isEarned: Boolean(row.isEarned ?? row.is_earned ?? false),
    earnedAt: row.earnedAt ?? row.earned_at ?? null,
  })) as MemberBadgeProgress[];
}

export async function loadBadgeLeaderboard(limit = 10) {
  return (await loadBadgeLeaderboardViaApi(limit)).map((row) => ({
    memberId: String(row.memberId ?? row.member_id ?? ""),
    memberNumber: String(row.memberNumber ?? row.member_number ?? ""),
    memberName: String(row.memberName ?? row.member_name ?? ""),
    badgeCount: Number(row.badgeCount ?? row.badge_count ?? 0),
  })) as BadgeLeaderboardEntry[];
}
