import { supabase } from "./supabase-client.js";
import { config } from "./config.js";
import { findMemberIdViaMemberService } from "./member-client.js";

const useMemory = !config.splitMode && !config.hasSupabaseConfig;

// In-memory fallback for local/dev when Supabase creds are not set
const memory = {
  campaigns: [
    {
      id: "00000000-0000-0000-0000-000000000001",
      campaign_code: "CMP-LOCAL-2X",
      campaign_name: "Local Dev 2x",
      description: "Local multiplier campaign",
      campaign_type: "multiplier_event",
      status: "active",
      multiplier: 2,
      minimum_purchase_amount: 0,
      bonus_points: 0,
      product_scope: [],
      eligible_tiers: [],
      reward_id: null,
      flash_sale_quantity_limit: null,
      flash_sale_claimed_count: 0,
      starts_at: new Date(Date.now() - 3600_000).toISOString(),
      ends_at: new Date(Date.now() + 86400_000).toISOString(),
      budget_limit: 10_000,
      budget_spent: 0,
      auto_pause: true,
    },
  ] as any[],
  variants: new Map<string, "A" | "B">(),
};
import type {
  Campaign,
  CampaignInput,
  MultiplierLookupInput,
  MultiplierLookupResult,
  VariantAssignment,
} from "./types.js";

function mapCampaign(row: any): Campaign {
  return {
    id: String(row.id ?? ""),
    campaignCode: String(row.campaign_code ?? ""),
    campaignName: String(row.campaign_name ?? ""),
    description: row.description ?? null,
    campaignType: row.campaign_type,
    status: row.status,
    multiplier: Number(row.multiplier ?? 1),
    minimumPurchaseAmount: Number(row.minimum_purchase_amount ?? 0),
    bonusPoints: Number(row.bonus_points ?? 0),
    productScope: Array.isArray(row.product_scope) ? row.product_scope.map(String) : [],
    eligibleTiers: Array.isArray(row.eligible_tiers) ? row.eligible_tiers.map(String) : [],
    rewardId: row.reward_id === null || row.reward_id === undefined ? null : Number(row.reward_id),
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
    budgetLimit: row.budget_limit === null || row.budget_limit === undefined ? null : Number(row.budget_limit),
    budgetSpent: Number(row.budget_spent ?? 0),
    autoPause: Boolean(row.auto_pause ?? true),
  };
}

function isMissingRpcError(error: unknown, functionName: string) {
  const message = String(
    (error as { message?: unknown; details?: unknown; hint?: unknown })?.message ??
      (error as { details?: unknown })?.details ??
      (error as { hint?: unknown })?.hint ??
      ""
  ).toLowerCase();

  return message.includes(functionName.toLowerCase()) && (
    message.includes("could not find the function") ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

function isMissingRelationError(error: unknown, tableName: string) {
  const message = String(
    (error as { message?: unknown; details?: unknown; hint?: unknown })?.message ??
      (error as { details?: unknown })?.details ??
      (error as { hint?: unknown })?.hint ??
      ""
  ).toLowerCase();
  const table = tableName.toLowerCase();
  return (
    message.includes(`relation "${table}" does not exist`) ||
    message.includes(`relation "public.${table}" does not exist`) ||
    message.includes(`could not find the table 'public.${table}' in the schema cache`) ||
    message.includes(`could not find the table "${table}" in the schema cache`) ||
    (message.includes(table) && message.includes("schema cache")) ||
    (message.includes(table) && message.includes("does not exist"))
  );
}

function isOldSharedAnalyticsError(error: unknown) {
  return (
    isMissingRelationError(error, "loyalty_members") ||
    isMissingRelationError(error, "loyalty_transactions") ||
    isMissingRelationError(error, "notification_outbox") ||
    isMissingRelationError(error, "reward_redemptions")
  );
}

function isCampaignCurrentlyActive(campaign: Campaign) {
  const now = Date.now();
  const startsAt = new Date(campaign.startsAt).getTime();
  const endsAt = new Date(campaign.endsAt).getTime();
  return (
    campaign.status === "active" &&
    Number.isFinite(startsAt) &&
    Number.isFinite(endsAt) &&
    startsAt <= now &&
    endsAt >= now &&
    (campaign.budgetLimit === null || campaign.budgetSpent < campaign.budgetLimit)
  );
}

export async function upsertCampaign(input: CampaignInput): Promise<Campaign> {
  if (useMemory) {
    const existingIdx = memory.campaigns.findIndex((c) => c.id === input.id);
    const record = {
      ...(existingIdx >= 0 ? memory.campaigns[existingIdx] : {}),
      ...{
        id: input.id ?? `cmp-${Date.now()}`,
        campaign_code: input.campaignCode,
        campaign_name: input.campaignName,
        description: input.description ?? null,
        campaign_type: input.campaignType,
        status: input.status ?? "scheduled",
        multiplier: Math.max(1, Number(input.multiplier ?? 1)),
        minimum_purchase_amount: Math.max(0, Number(input.minimumPurchaseAmount ?? 0)),
        bonus_points: Math.max(0, Math.floor(Number(input.bonusPoints ?? 0))),
        product_scope: input.productScope ?? [],
        eligible_tiers: input.eligibleTiers ?? [],
        reward_id:
          input.rewardId === undefined || input.rewardId === null || input.rewardId === "" ? null : Number(input.rewardId),
        flash_sale_quantity_limit: input.flashSaleQuantityLimit ?? null,
        flash_sale_claimed_count: 0,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        budget_limit: input.budgetLimit ?? null,
        budget_spent: 0,
        auto_pause: input.autoPause ?? true,
      },
    };
    if (existingIdx >= 0) memory.campaigns[existingIdx] = record;
    else memory.campaigns.push(record);
    return mapCampaign(record);
  }
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
      input.rewardId === undefined || input.rewardId === null || input.rewardId === "" ? null : Number(input.rewardId),
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
    push_notification_enabled: Boolean(input.pushNotificationEnabled ?? false),
    budget_limit:
      input.budgetLimit === undefined || input.budgetLimit === null ? null : Math.max(0, Number(input.budgetLimit)),
    auto_pause: input.autoPause ?? true,
  };

  const query = input.id
    ? supabase.from("promotion_campaigns").update(payload).eq("id", input.id).select("*").single()
    : supabase.from("promotion_campaigns").insert(payload).select("*").single();

  const { data, error } = await query;
  if (error) throw error;
  return mapCampaign(data);
}

export async function listCampaigns(): Promise<Campaign[]> {
  if (useMemory) return memory.campaigns.map(mapCampaign);
  const { data, error } = await supabase.from("promotion_campaigns").select("*").order("starts_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapCampaign);
}

export async function getActiveCampaigns(): Promise<Campaign[]> {
  if (useMemory) {
    const now = Date.now();
    return memory.campaigns
      .filter(
        (c) =>
          c.status === "active" &&
          new Date(c.starts_at).getTime() <= now &&
          new Date(c.ends_at).getTime() >= now &&
          (c.budget_limit === null || c.budget_spent < c.budget_limit)
      )
      .map(mapCampaign);
  }
  const { data, error } = await supabase.rpc("campaign_active_list");
  if (error) {
    if (isMissingRpcError(error, "campaign_active_list") || isOldSharedAnalyticsError(error)) {
      return (await listCampaigns()).filter(isCampaignCurrentlyActive);
    }
    throw error;
  }
  return (data || []).map(mapCampaign);
}

export async function assignVariant(campaignId: string, memberId: number): Promise<VariantAssignment> {
  if (useMemory) {
    const key = `${campaignId}:${memberId}`;
    if (!memory.variants.has(key)) {
      memory.variants.set(key, memberId % 2 === 0 ? "A" : "B");
    }
    return { campaignId, memberId, variant: memory.variants.get(key)! };
  }
  const { data, error } = await supabase.rpc("campaign_assign_variant", {
    p_campaign_id: campaignId,
    p_member_id: memberId,
  });
  if (error) throw error;
  return {
    campaignId,
    memberId,
    variant: (Array.isArray(data) ? data[0] : data)?.variant ?? "A",
  } as VariantAssignment;
}

export async function lookupMultiplier(input: MultiplierLookupInput): Promise<MultiplierLookupResult> {
  if (useMemory) {
    const active = (await getActiveCampaigns()).find((c) => c.campaignType === "multiplier_event");
    if (!active) return { active: false, campaignId: null, multiplier: 1, variant: "A", bonusPoints: 0 };
    const variant = (await assignVariant(active.id, 1)).variant;
    const multiplier = active.multiplier ?? 1;
    const basePoints = Math.floor(Math.max(0, input.amountSpent));
    const bonusPoints = Math.floor(basePoints * (multiplier - 1));
    return {
      active: true,
      campaignId: active.id,
      multiplier,
      variant,
      bonusPoints,
    };
  }
  const { data, error } = await supabase.rpc("campaign_active_multiplier", {
    p_member_identifier: input.memberIdentifier,
    p_fallback_email: input.fallbackEmail ?? null,
    p_amount_spent: input.amountSpent,
    p_tier: input.tier ?? null,
  });
  if (error) {
    if (isMissingRpcError(error, "campaign_active_multiplier") || isOldSharedAnalyticsError(error)) {
      const active = (await getActiveCampaigns()).find((campaign) => {
        const tierAllowed =
          !input.tier ||
          campaign.eligibleTiers.length === 0 ||
          campaign.eligibleTiers.some((tier) => tier.toLowerCase() === String(input.tier).toLowerCase());
        return (
          campaign.campaignType === "multiplier_event" &&
          Number(input.amountSpent || 0) >= Number(campaign.minimumPurchaseAmount || 0) &&
          tierAllowed
        );
      });
      if (!active) return { active: false, campaignId: null, multiplier: 1, variant: "A", bonusPoints: 0 };
      const memberId = await findMemberId(input.memberIdentifier, input.fallbackEmail);
      const variant = memberId ? (await assignVariant(active.id, memberId)).variant : "A";
      const multiplier = active.multiplier ?? 1;
      const basePoints = Math.floor(Math.max(0, input.amountSpent));
      return {
        active: true,
        campaignId: active.id,
        multiplier,
        variant,
        bonusPoints: Math.floor(basePoints * Math.max(0, multiplier - 1)),
      };
    }
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { active: false, campaignId: null, multiplier: 1, variant: "A", bonusPoints: 0 };
  }
  return {
    active: true,
    campaignId: String(row.campaign_id ?? ""),
    multiplier: Number(row.multiplier ?? 1),
    variant: (row.variant ?? "A") as "A" | "B",
    bonusPoints: Number(row.bonus_points ?? 0),
  };
}

export async function trackBudgetConsumption(campaignId: string, bonusPoints: number) {
  if (useMemory) {
    const idx = memory.campaigns.findIndex((c) => c.id === campaignId);
    if (idx >= 0) {
      memory.campaigns[idx].budget_spent += Math.max(0, bonusPoints);
    }
    return { budget_remaining: null, paused: false };
  }
  const { data, error } = await supabase.rpc("campaign_consume_budget", {
    p_campaign_id: campaignId,
    p_points_consumed: bonusPoints,
  });
  if (error) throw error;
  return data;
}

export async function findMemberId(memberIdentifier: string, fallbackEmail?: string): Promise<number | null> {
  if (config.splitMode) {
    return findMemberIdViaMemberService(memberIdentifier, fallbackEmail);
  }

  if (useMemory) return 1;
  const trimmed = memberIdentifier.trim();
  const byNumber = await supabase
    .from("loyalty_members")
    .select("id")
    .eq("member_number", trimmed)
    .limit(1)
    .maybeSingle();
  if (byNumber.data?.id !== undefined) return Number(byNumber.data.id);

  if (fallbackEmail) {
    const byEmail = await supabase
      .from("loyalty_members")
      .select("id")
      .ilike("email", fallbackEmail)
      .limit(1)
      .maybeSingle();
    if (byEmail.data?.id !== undefined) return Number(byEmail.data.id);
  }

  return null;
}

export async function loadCampaignPerformance() {
  if (useMemory) return [];
  const { data, error } = await supabase.rpc("loyalty_campaign_performance");
  if (error) {
    if (isMissingRpcError(error, "loyalty_campaign_performance") || isOldSharedAnalyticsError(error)) return [];
    throw error;
  }
  return data;
}

export async function queueCampaignNotifications(campaignId: string) {
  if (useMemory) return 0;
  const { data, error } = await supabase.rpc("loyalty_queue_campaign_notifications", {
    p_campaign_id: campaignId,
  });
  if (error) {
    if (isMissingRpcError(error, "loyalty_queue_campaign_notifications")) return 0;
    throw error;
  }
  return Number(data || 0);
}
