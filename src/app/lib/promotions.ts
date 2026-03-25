import { supabase } from "../../utils/supabase/client";

type AnyRecord = Record<string, any>;

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

function normalizeCampaign(row: AnyRecord): PromotionCampaign {
  const reward = row.rewards_catalog as AnyRecord | null;

  return {
    id: String(row.id ?? ""),
    campaignCode: String(row.campaign_code ?? ""),
    campaignName: String(row.campaign_name ?? "Campaign"),
    description: String(row.description ?? ""),
    campaignType: String(row.campaign_type ?? "bonus_points") as PromotionCampaignType,
    status: String(row.status ?? "scheduled") as PromotionCampaignStatus,
    multiplier: Number(row.multiplier ?? 1),
    minimumPurchaseAmount: Number(row.minimum_purchase_amount ?? 0),
    bonusPoints: Number(row.bonus_points ?? 0),
    productScope: Array.isArray(row.product_scope)
      ? row.product_scope.map((entry: unknown) => String(entry))
      : [],
    eligibleTiers: Array.isArray(row.eligible_tiers)
      ? row.eligible_tiers.map((entry: unknown) => String(entry))
      : [],
    rewardId: reward?.reward_id ? String(reward.reward_id) : null,
    rewardName: reward?.name ? String(reward.name) : null,
    rewardPointsCost: reward?.points_cost !== undefined ? Number(reward.points_cost ?? 0) : null,
    rewardImageUrl: reward?.image_url ? String(reward.image_url) : null,
    flashSaleQuantityLimit:
      row.flash_sale_quantity_limit === null || row.flash_sale_quantity_limit === undefined
        ? null
        : Number(row.flash_sale_quantity_limit),
    flashSaleClaimedCount: Number(row.flash_sale_claimed_count ?? 0),
    startsAt: String(row.starts_at ?? new Date().toISOString()),
    endsAt: String(row.ends_at ?? new Date().toISOString()),
    countdownLabel: row.countdown_label ? String(row.countdown_label) : null,
    bannerTitle: row.banner_title ? String(row.banner_title) : null,
    bannerMessage: row.banner_message ? String(row.banner_message) : null,
    bannerColor: String(row.banner_color ?? "#1A2B47"),
    pushNotificationEnabled: Boolean(row.push_notification_enabled ?? false),
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

async function lookupMemberId(memberIdentifier?: string, fallbackEmail?: string) {
  if (memberIdentifier) {
    const byNumber = await supabase
      .from("loyalty_members")
      .select("id")
      .eq("member_number", memberIdentifier)
      .limit(1)
      .maybeSingle();

    if (byNumber.error) throw byNumber.error;
    if (byNumber.data?.id !== undefined) return Number(byNumber.data.id);
  }

  if (fallbackEmail) {
    const byEmail = await supabase
      .from("loyalty_members")
      .select("id")
      .ilike("email", fallbackEmail)
      .limit(1)
      .maybeSingle();

    if (byEmail.error) throw byEmail.error;
    if (byEmail.data?.id !== undefined) return Number(byEmail.data.id);
  }

  return null;
}

export async function loadPromotionCampaigns(): Promise<PromotionCampaign[]> {
  const { data, error } = await supabase
    .from("promotion_campaigns")
    .select("*, rewards_catalog(id,reward_id,name,points_cost,image_url)")
    .order("starts_at", { ascending: false });

  if (error) throw error;
  return (data || []).map((row) => normalizeCampaign(row as AnyRecord));
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
  const payload = {
    campaign_code: input.campaignCode.trim(),
    campaign_name: input.campaignName.trim(),
    description: input.description?.trim() || null,
    campaign_type: input.campaignType,
    status: input.status ?? "scheduled",
    multiplier: Math.max(1, Number(input.multiplier ?? 1)),
    minimum_purchase_amount: Math.max(0, Number(input.minimumPurchaseAmount ?? 0)),
    bonus_points: Math.max(0, Math.floor(Number(input.bonusPoints ?? 0))),
    product_scope: (input.productScope || []).map((entry) => entry.trim()).filter(Boolean),
    eligible_tiers: (input.eligibleTiers || []).map((entry) => entry.trim()).filter(Boolean),
    reward_id:
      input.rewardId === undefined || input.rewardId === null || input.rewardId === ""
        ? null
        : Number(input.rewardId),
    flash_sale_quantity_limit:
      input.flashSaleQuantityLimit === undefined || input.flashSaleQuantityLimit === null
        ? null
        : Math.max(1, Math.floor(Number(input.flashSaleQuantityLimit))),
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    countdown_label: input.countdownLabel?.trim() || null,
    banner_title: input.bannerTitle?.trim() || null,
    banner_message: input.bannerMessage?.trim() || null,
    banner_color: input.bannerColor?.trim() || "#1A2B47",
    push_notification_enabled: Boolean(input.pushNotificationEnabled),
  };

  const query = input.id
    ? supabase.from("promotion_campaigns").update(payload).eq("id", input.id).select("*").single()
    : supabase.from("promotion_campaigns").insert(payload).select("*").single();

  const { data, error } = await query;
  if (error) throw error;

  return normalizeCampaign(data as AnyRecord);
}

export async function queueCampaignNotifications(campaignId: string) {
  const { data, error } = await supabase.rpc("loyalty_queue_campaign_notifications", {
    p_campaign_id: campaignId,
  });

  if (error) throw error;
  return Number(data || 0);
}

export async function loadCampaignPerformance(): Promise<CampaignPerformance[]> {
  const { data, error } = await supabase.rpc("loyalty_campaign_performance");
  if (error) throw error;

  return ((data || []) as AnyRecord[]).map((row) => ({
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
  const { data, error } = await supabase
    .from("reward_partners")
    .select("*")
    .order("partner_name", { ascending: true });

  if (error) throw error;
  return (data || []).map((row) => normalizePartner(row as AnyRecord));
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
  return normalizePartner(data as AnyRecord);
}

export async function loadPartnerPerformance(): Promise<RewardPartnerPerformance[]> {
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
}

export async function loadMemberBadgeProgress(memberIdentifier?: string, fallbackEmail?: string) {
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
  const { data, error } = await supabase.rpc("loyalty_badge_leaderboard", { p_limit: limit });
  if (error) throw error;

  return ((data || []) as AnyRecord[]).map((row) => ({
    memberId: String(row.member_id ?? ""),
    memberNumber: String(row.member_number ?? ""),
    memberName: String(row.member_name ?? ""),
    badgeCount: Number(row.badge_count ?? 0),
  })) as BadgeLeaderboardEntry[];
}

