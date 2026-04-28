import { supabase } from "./supabase-client.js";
import { config } from "./config.js";
import type {
  Campaign,
  CampaignInput,
  CampaignVariant,
  CampaignWinnerResult,
  MultiplierLookupInput,
  MultiplierLookupResult,
  VariantAssignment,
} from "./types.js";

type MemoryCampaignRecord = {
  id: string;
  campaign_code: string;
  campaign_name: string;
  description: string | null;
  campaign_type: Campaign["campaignType"];
  status: Campaign["status"];
  multiplier: number;
  minimum_purchase_amount: number;
  bonus_points: number;
  product_scope: string[];
  eligible_tiers: string[];
  reward_id: number | null;
  flash_sale_quantity_limit: number | null;
  flash_sale_claimed_count: number;
  starts_at: string;
  ends_at: string;
  budget_limit: number | null;
  budget_spent: number;
  auto_pause: boolean;
  notifications_sent: number;
  tracked_transactions: number;
  redemption_count: number;
  winning_variant: CampaignVariant | null;
  winner_declared_at: string | null;
  variant_score_a: number;
  variant_score_b: number;
};

const useMemory =
  config.useLocalFallback ||
  !config.supabaseUrl ||
  config.supabaseUrl.startsWith("http://127.0.0.1") ||
  config.supabaseUrl.startsWith("http://localhost");

function buildDefaultCampaigns(): MemoryCampaignRecord[] {
  return [
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
      starts_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      budget_limit: 10_000,
      budget_spent: 0,
      auto_pause: true,
      notifications_sent: 0,
      tracked_transactions: 0,
      redemption_count: 0,
      winning_variant: null,
      winner_declared_at: null,
      variant_score_a: 0,
      variant_score_b: 0,
    },
  ];
}

const memory = {
  campaigns: buildDefaultCampaigns(),
  variants: new Map<string, CampaignVariant>(),
};

function stableMemberId(memberIdentifier: string, fallbackEmail?: string) {
  const source = `${memberIdentifier.trim().toLowerCase()}|${String(fallbackEmail || "").trim().toLowerCase()}`;
  let hash = 0;
  for (const char of source) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return (hash % 10_000) + 1;
}

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
    budgetLimit: row.budget_limit === null || row.budget_limit === undefined ? null : Number(row.budget_limit),
    budgetSpent: Number(row.budget_spent ?? 0),
    autoPause: Boolean(row.auto_pause ?? true),
    winningVariant: row.winning_variant === "A" || row.winning_variant === "B" ? row.winning_variant : null,
    winnerDeclaredAt: row.winner_declared_at ?? null,
  };
}

function buildMemoryRecord(input: CampaignInput, existing?: Partial<MemoryCampaignRecord>): MemoryCampaignRecord {
  return {
    id: input.id ?? existing?.id ?? `cmp-${Date.now()}`,
    campaign_code: input.campaignCode,
    campaign_name: input.campaignName,
    description: input.description ?? null,
    campaign_type: input.campaignType,
    status: input.status ?? existing?.status ?? "draft",
    multiplier: Math.max(1, Number(input.multiplier ?? existing?.multiplier ?? 1)),
    minimum_purchase_amount: Math.max(0, Number(input.minimumPurchaseAmount ?? existing?.minimum_purchase_amount ?? 0)),
    bonus_points: Math.max(0, Math.floor(Number(input.bonusPoints ?? existing?.bonus_points ?? 0))),
    product_scope: input.productScope ?? existing?.product_scope ?? [],
    eligible_tiers: input.eligibleTiers ?? existing?.eligible_tiers ?? [],
    reward_id:
      input.rewardId === undefined || input.rewardId === null || input.rewardId === "" ? null : Number(input.rewardId),
    flash_sale_quantity_limit:
      input.flashSaleQuantityLimit === undefined ? existing?.flash_sale_quantity_limit ?? null : input.flashSaleQuantityLimit,
    flash_sale_claimed_count: existing?.flash_sale_claimed_count ?? 0,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    budget_limit:
      input.budgetLimit === undefined ? existing?.budget_limit ?? null : input.budgetLimit,
    budget_spent: existing?.budget_spent ?? 0,
    auto_pause: input.autoPause ?? existing?.auto_pause ?? true,
    notifications_sent: existing?.notifications_sent ?? 0,
    tracked_transactions: existing?.tracked_transactions ?? 0,
    redemption_count: existing?.redemption_count ?? 0,
    winning_variant: existing?.winning_variant ?? null,
    winner_declared_at: existing?.winner_declared_at ?? null,
    variant_score_a: existing?.variant_score_a ?? 0,
    variant_score_b: existing?.variant_score_b ?? 0,
  };
}

function upsertMemoryCampaign(input: CampaignInput): Campaign {
  const existingIndex = memory.campaigns.findIndex(
    (campaign) => campaign.id === input.id || campaign.campaign_code === input.campaignCode
  );
  const existing = existingIndex >= 0 ? memory.campaigns[existingIndex] : undefined;
  const record = buildMemoryRecord(input, existing);
  if (existingIndex >= 0) memory.campaigns[existingIndex] = record;
  else memory.campaigns.push(record);
  return mapCampaign(record);
}

function memoryCampaign(campaignId: string) {
  return memory.campaigns.find((campaign) => String(campaign.id) === campaignId);
}

function eligibleForMultiplier(campaign: MemoryCampaignRecord, input: MultiplierLookupInput) {
  const now = Date.now();
  if (campaign.status !== "active") return false;
  if (new Date(campaign.starts_at).getTime() > now) return false;
  if (new Date(campaign.ends_at).getTime() < now) return false;
  if (campaign.campaign_type !== "multiplier_event") return false;
  if (campaign.minimum_purchase_amount > Math.max(0, input.amountSpent)) return false;
  if (campaign.budget_limit !== null && campaign.budget_spent >= campaign.budget_limit) return false;
  if (campaign.eligible_tiers.length > 0 && input.tier) {
    const normalizedTier = input.tier.toLowerCase();
    if (!campaign.eligible_tiers.some((tier) => tier.toLowerCase() === normalizedTier)) return false;
  }
  return true;
}

function buildPerformanceRow(campaign: MemoryCampaignRecord) {
  return {
    campaign_id: campaign.id,
    campaign_code: campaign.campaign_code,
    campaign_name: campaign.campaign_name,
    campaign_type: campaign.campaign_type,
    status: campaign.status,
    starts_at: campaign.starts_at,
    ends_at: campaign.ends_at,
    notifications_sent: campaign.notifications_sent,
    tracked_transactions: campaign.tracked_transactions,
    points_awarded: campaign.budget_spent,
    redemption_count: campaign.redemption_count,
    quantity_limit: campaign.flash_sale_quantity_limit,
    quantity_claimed: campaign.flash_sale_claimed_count,
    sell_through:
      campaign.flash_sale_quantity_limit && campaign.flash_sale_quantity_limit > 0
        ? Number(((campaign.flash_sale_claimed_count / campaign.flash_sale_quantity_limit) * 100).toFixed(1))
        : null,
  };
}

function buildBudgetStatus(campaign: Campaign, performance?: any) {
  const budgetLimit = campaign.budgetLimit;
  const budgetSpent = Number(campaign.budgetSpent ?? performance?.points_awarded ?? performance?.pointsAwarded ?? 0);
  const quantityLimit = performance?.quantity_limit ?? performance?.quantityLimit ?? campaign.flashSaleQuantityLimit;
  const quantityClaimed = Number(
    performance?.quantity_claimed ?? performance?.quantityClaimed ?? campaign.flashSaleClaimedCount ?? 0
  );
  let utilizationPercent = 0;

  if (budgetLimit !== null && budgetLimit > 0) {
    utilizationPercent = Math.min(100, (budgetSpent / budgetLimit) * 100);
  } else if (quantityLimit && Number(quantityLimit) > 0) {
    utilizationPercent = Math.min(100, (quantityClaimed / Number(quantityLimit)) * 100);
  } else if (campaign.bonusPoints > 0) {
    utilizationPercent = Math.min(100, (budgetSpent / (campaign.bonusPoints * 100)) * 100);
  }

  const now = Date.now();
  const active =
    campaign.status === "active" &&
    new Date(campaign.startsAt).getTime() <= now &&
    new Date(campaign.endsAt).getTime() >= now &&
    (budgetLimit === null || budgetSpent < budgetLimit);

  return {
    campaignId: campaign.id,
    campaignName: campaign.campaignName,
    status: campaign.status,
    active,
    budgetLimit,
    budgetSpent,
    budgetRemaining: budgetLimit === null ? null : Math.max(0, budgetLimit - budgetSpent),
    utilizationPercent: Number(utilizationPercent.toFixed(1)),
    trackedTransactions: Number(performance?.tracked_transactions ?? performance?.trackedTransactions ?? 0),
    pointsAwarded: Number(performance?.points_awarded ?? performance?.pointsAwarded ?? budgetSpent),
    notificationsSent: Number(performance?.notifications_sent ?? performance?.notificationsSent ?? 0),
    redemptionCount: Number(performance?.redemption_count ?? performance?.redemptionCount ?? 0),
    quantityLimit: quantityLimit ?? null,
    quantityClaimed,
    sellThrough: performance?.sell_through ?? performance?.sellThrough ?? null,
    winningVariant: campaign.winningVariant ?? null,
  };
}

export function resetMemoryCampaignStore(seedDefaults = true) {
  memory.campaigns = seedDefaults ? buildDefaultCampaigns() : [];
  memory.variants.clear();
}

export function seedMemoryCampaign(input: CampaignInput) {
  return upsertMemoryCampaign(input);
}

export function getMemoryCampaign(campaignId: string) {
  const record = memoryCampaign(campaignId);
  return record ? mapCampaign(record) : null;
}

export function listMemoryCampaigns() {
  return memory.campaigns.map((campaign) => mapCampaign(campaign));
}

export async function upsertCampaign(input: CampaignInput): Promise<Campaign> {
  if (useMemory) return upsertMemoryCampaign(input);

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
    budget_limit:
      input.budgetLimit === undefined || input.budgetLimit === null ? null : Math.max(0, Number(input.budgetLimit)),
    auto_pause: input.autoPause ?? true,
  };

  const query = input.id
    ? supabase.from("promotion_campaigns").update(payload).eq("id", input.id).select("*").single()
    : supabase.from("promotion_campaigns").insert(payload).select("*").single();

  const { data, error } = await query;
  if (error) return upsertMemoryCampaign(input);
  return mapCampaign(data);
}

export async function listCampaigns(): Promise<Campaign[]> {
  if (useMemory) return memory.campaigns.map(mapCampaign);
  const { data, error } = await supabase.from("promotion_campaigns").select("*").order("starts_at", { ascending: false });
  if (error) return memory.campaigns.map(mapCampaign);
  return (data || []).map(mapCampaign);
}

export async function getCampaignById(campaignId: string): Promise<Campaign | null> {
  const local = memoryCampaign(campaignId);
  if (useMemory) return local ? mapCampaign(local) : null;

  const { data, error } = await supabase
    .from("promotion_campaigns")
    .select("*")
    .eq("id", campaignId)
    .limit(1)
    .maybeSingle();
  if (error || !data) return local ? mapCampaign(local) : null;
  return mapCampaign(data);
}

export async function publishCampaign(campaignId: string): Promise<Campaign> {
  const local = memoryCampaign(campaignId);
  if (useMemory) {
    if (!local) throw new Error("Campaign not found.");
    local.status = "active";
    return mapCampaign(local);
  }

  const { data, error } = await supabase
    .from("promotion_campaigns")
    .update({ status: "active" })
    .eq("id", campaignId)
    .select("*")
    .single();
  if (error) {
    if (!local) throw new Error("Campaign not found.");
    local.status = "active";
    return mapCampaign(local);
  }
  return mapCampaign(data);
}

export async function pauseCampaign(campaignId: string): Promise<Campaign> {
  const local = memoryCampaign(campaignId);
  if (useMemory) {
    if (!local) throw new Error("Campaign not found.");
    local.status = "paused";
    return mapCampaign(local);
  }

  const { data, error } = await supabase
    .from("promotion_campaigns")
    .update({ status: "paused" })
    .eq("id", campaignId)
    .select("*")
    .single();
  if (error) {
    if (!local) throw new Error("Campaign not found.");
    local.status = "paused";
    return mapCampaign(local);
  }
  return mapCampaign(data);
}

export async function getActiveCampaigns(): Promise<Campaign[]> {
  if (useMemory) {
    const now = Date.now();
    return memory.campaigns
      .filter(
        (campaign) =>
          campaign.status === "active" &&
          new Date(campaign.starts_at).getTime() <= now &&
          new Date(campaign.ends_at).getTime() >= now &&
          (campaign.budget_limit === null || campaign.budget_spent < campaign.budget_limit)
      )
      .map(mapCampaign);
  }
  const { data, error } = await supabase.rpc("campaign_active_list");
  if (error) return memory.campaigns.map(mapCampaign).filter((campaign) => campaign.status === "active");
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
    const active = memory.campaigns.find((campaign) => eligibleForMultiplier(campaign, input));
    if (!active) return { active: false, campaignId: null, multiplier: 1, variant: "A", bonusPoints: 0 };
    const memberId = stableMemberId(input.memberIdentifier, input.fallbackEmail);
    const variant = (await assignVariant(active.id, memberId)).variant;
    const multiplier = active.multiplier ?? 1;
    const basePoints = Math.floor(Math.max(0, input.amountSpent));
    const bonusPoints = Math.floor(basePoints * Math.max(0, multiplier - 1));
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
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { active: false, campaignId: null, multiplier: 1, variant: "A", bonusPoints: 0 };
  }
  return {
    active: true,
    campaignId: String(row.campaign_id ?? ""),
    multiplier: Number(row.multiplier ?? 1),
    variant: (row.variant ?? "A") as CampaignVariant,
    bonusPoints: Number(row.bonus_points ?? 0),
  };
}

export async function trackBudgetConsumption(campaignId: string, bonusPoints: number) {
  if (useMemory) {
    const campaign = memoryCampaign(campaignId);
    if (!campaign) return { budget_remaining: null, paused: false };
    campaign.budget_spent += Math.max(0, Math.floor(bonusPoints));
    campaign.tracked_transactions += 1;
    const paused =
      Boolean(campaign.auto_pause) &&
      campaign.budget_limit !== null &&
      campaign.budget_spent >= campaign.budget_limit;
    if (paused) {
      campaign.status = "paused";
    }
    return {
      budget_remaining: campaign.budget_limit === null ? null : Math.max(0, campaign.budget_limit - campaign.budget_spent),
      paused,
    };
  }

  const { data, error } = await supabase.rpc("campaign_consume_budget", {
    p_campaign_id: campaignId,
    p_points_consumed: bonusPoints,
  });
  if (error) throw error;
  return data;
}

export async function findMemberId(memberIdentifier: string, fallbackEmail?: string): Promise<number | null> {
  if (useMemory) return stableMemberId(memberIdentifier, fallbackEmail);
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
  if (useMemory) return memory.campaigns.map((campaign) => buildPerformanceRow(campaign));
  const { data, error } = await supabase.rpc("loyalty_campaign_performance");
  if (error) return memory.campaigns.map((campaign) => buildPerformanceRow(campaign));
  return data;
}

export async function getCampaignBudgetStatus(campaignId: string) {
  const campaign = (await listCampaigns()).find((item) => item.id === campaignId);
  if (!campaign) throw new Error("Campaign not found.");
  const performance = (await loadCampaignPerformance()).find((row: any) => String(row?.campaign_id ?? row?.campaignId ?? "") === campaignId);
  return buildBudgetStatus(campaign, performance);
}

export async function queueCampaignNotifications(campaignId: string) {
  if (useMemory) {
    const campaign = memoryCampaign(campaignId);
    if (!campaign) return 0;
    const queued = Math.max(1, Math.ceil(Math.max(1, campaign.tracked_transactions) / 2));
    campaign.notifications_sent += queued;
    return queued;
  }
  const { data, error } = await supabase.rpc("loyalty_queue_campaign_notifications", {
    p_campaign_id: campaignId,
  });
  if (error) return 0;
  return Number(data || 0);
}

export async function declareWinner(
  campaignId: string,
  scores: { A: number; B: number }
): Promise<CampaignWinnerResult> {
  const winner: CampaignVariant = Number(scores.B) > Number(scores.A) ? "B" : "A";
  const declaredAt = new Date().toISOString();

  if (useMemory) {
    const campaign = memoryCampaign(campaignId);
    if (!campaign) throw new Error("Campaign not found.");
    campaign.winning_variant = winner;
    campaign.winner_declared_at = declaredAt;
    campaign.variant_score_a = Number(scores.A);
    campaign.variant_score_b = Number(scores.B);
    return {
      campaignId,
      winner,
      declaredAt,
      scores: { A: Number(scores.A), B: Number(scores.B) },
    };
  }

  const { error } = await supabase
    .from("promotion_campaigns")
    .update({
      winning_variant: winner,
      winner_declared_at: declaredAt,
    })
    .eq("id", campaignId);

  if (error) {
    const campaign = memoryCampaign(campaignId);
    if (!campaign) throw new Error("Campaign not found.");
    campaign.winning_variant = winner;
    campaign.winner_declared_at = declaredAt;
  }

  return {
    campaignId,
    winner,
    declaredAt,
    scores: { A: Number(scores.A), B: Number(scores.B) },
  };
}
