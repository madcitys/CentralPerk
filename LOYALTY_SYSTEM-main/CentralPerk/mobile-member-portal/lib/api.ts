import type { CampaignItem, MemberSnapshot, PortalData, RewardItem, TransactionItem } from "./types";
import { mockPortalData } from "./mock-data";

const MEMBER_ID = process.env.EXPO_PUBLIC_MEMBER_ID || "CP-1001";
const MEMBER_EMAIL = process.env.EXPO_PUBLIC_MEMBER_EMAIL || "kiefer@example.com";
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 4000;

const TIER_THRESHOLDS = [
  { tier: "Gold", min: 750 },
  { tier: "Silver", min: 250 },
  { tier: "Bronze", min: 0 },
] as const;

function buildUrl(path: string) {
  if (!API_BASE_URL) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL is not configured.");
  }

  return `${API_BASE_URL}${path}`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(buildUrl(path), {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = typeof payload?.error === "string" ? payload.error : `Request failed (${response.status})`;
    throw new Error(error);
  }

  return payload as T;
}

function normalizeTier(value: unknown): MemberSnapshot["tier"] {
  const tier = String(value || "").trim().toLowerCase();
  if (tier === "gold") return "Gold";
  if (tier === "silver") return "Silver";
  return "Bronze";
}

function mapTransactionType(value: unknown): TransactionItem["type"] {
  const type = String(value || "").trim().toUpperCase();
  if (type === "REDEEM" || type === "REDEEMED" || type === "REWARD_REDEEMED") return "redeemed";
  if (type === "GIFT" || type === "GIFTED") return "gifted";
  if (type === "EXPIRED" || type === "EXPIRY") return "expired";
  if (type === "PENDING") return "pending";
  return "earned";
}

function getMonthKey(value: string | Date) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

async function loadMemberSnapshot(): Promise<MemberSnapshot> {
  const resolvedMemberId = MEMBER_ID || MEMBER_EMAIL;
  const query = MEMBER_EMAIL ? `?email=${encodeURIComponent(MEMBER_EMAIL)}` : "";

  const [pointsResponse, historyResponse] = await Promise.all([
    requestJson<{
      points: number;
      balance: { member_id: string; points_balance: number; tier: string };
    }>(`/api/members/${encodeURIComponent(resolvedMemberId)}/points${query}`),
    requestJson<{
      history: Array<Record<string, unknown>>;
    }>(`/api/members/${encodeURIComponent(resolvedMemberId)}/points-history${query}`),
  ]);

  const balance = Number(pointsResponse.points ?? pointsResponse.balance?.points_balance ?? 0);
  const sortedHistory = [...(historyResponse.history || [])].sort(
    (left, right) => new Date(String(right.date || right.transaction_date || "")).getTime() - new Date(String(left.date || left.transaction_date || "")).getTime()
  );

  let runningBalance = balance;
  const transactions = sortedHistory.map((row, index): TransactionItem => {
    const signedPoints = Number(row.points || 0);
    const type = mapTransactionType(row.type || row.transaction_type);
    const transaction = {
      id: String(row.id || row.transaction_id || row.reference || `${index}`),
      date: String(row.date || row.transaction_date || row.created_at || new Date().toISOString()),
      description: String(row.reason || row.description || row.transaction_type || row.type || "Transaction"),
      type,
      points: Math.abs(signedPoints),
      balance: runningBalance,
      category: type === "redeemed" || type === "gifted" ? "Reward" : "Purchase",
    } satisfies TransactionItem;

    if (type !== "pending") {
      runningBalance -= signedPoints;
    }

    return transaction;
  });

  const currentMonth = getMonthKey(new Date());
  const pendingPoints = sortedHistory
    .filter((row) => mapTransactionType(row.type || row.transaction_type) === "pending")
    .reduce((sum, row) => sum + Math.max(0, Number(row.points || 0)), 0);

  const earnedThisMonth = sortedHistory
    .filter((row) => mapTransactionType(row.type || row.transaction_type) === "earned")
    .filter((row) => getMonthKey(String(row.date || row.transaction_date || row.created_at || new Date().toISOString())) === currentMonth)
    .reduce((sum, row) => sum + Math.max(0, Number(row.points || 0)), 0);

  const redeemedThisMonth = sortedHistory
    .filter((row) => {
      const type = mapTransactionType(row.type || row.transaction_type);
      return (type === "redeemed" || type === "gifted") &&
        getMonthKey(String(row.date || row.transaction_date || row.created_at || new Date().toISOString())) === currentMonth;
    })
    .reduce((sum, row) => sum + Math.abs(Number(row.points || 0)), 0);

  const lifetimePoints = sortedHistory
    .filter((row) => mapTransactionType(row.type || row.transaction_type) === "earned")
    .reduce((sum, row) => sum + Math.max(0, Number(row.points || 0)), 0);

  return {
    memberId: String(pointsResponse.balance?.member_id || MEMBER_ID),
    fullName: "Central Perk Member",
    email: MEMBER_EMAIL,
    tier: normalizeTier(pointsResponse.balance?.tier),
    points: balance,
    pendingPoints,
    lifetimePoints,
    earnedThisMonth,
    redeemedThisMonth,
    transactions,
  };
}

async function loadCampaigns(tier: MemberSnapshot["tier"]): Promise<CampaignItem[]> {
  const response = await requestJson<{
    campaigns: Array<Record<string, unknown>>;
  }>(`/api/campaigns/active?tier=${encodeURIComponent(tier)}`);

  return (response.campaigns || []).map((campaign) => {
    const eligibleTiers = campaign.eligibleTiers || campaign.eligible_tiers;

    return ({
    id: String(campaign.id || ""),
    campaignName: String(campaign.campaignName || campaign.campaign_name || "Campaign"),
    description: String(campaign.description || ""),
    campaignType: String(campaign.campaignType || campaign.campaign_type || "bonus_points") as CampaignItem["campaignType"],
    bannerTitle: campaign.bannerTitle ? String(campaign.bannerTitle) : campaign.banner_title ? String(campaign.banner_title) : null,
    bannerMessage: campaign.bannerMessage ? String(campaign.bannerMessage) : campaign.banner_message ? String(campaign.banner_message) : null,
    bonusPoints: Number(campaign.bonusPoints || campaign.bonus_points || 0),
    multiplier: Number(campaign.multiplier || 0),
    endsAt: String(campaign.endsAt || campaign.ends_at || new Date().toISOString()),
    eligibleTiers: Array.isArray(eligibleTiers)
      ? eligibleTiers.map((entry: unknown) => String(entry))
      : [],
    flashSaleClaimedCount: Number(campaign.flashSaleClaimedCount || campaign.flash_sale_claimed_count || 0),
    flashSaleQuantityLimit:
      campaign.flashSaleQuantityLimit === null || campaign.flash_sale_quantity_limit === null
        ? null
        : Number(campaign.flashSaleQuantityLimit || campaign.flash_sale_quantity_limit || 0),
  });
  });
}

async function loadRewards(): Promise<RewardItem[]> {
  const response = await requestJson<{ rewards: RewardItem[] }>("/api/rewards");
  return response.rewards || [];
}

export async function loadPortalData(): Promise<PortalData> {
  if (!API_BASE_URL) {
    return mockPortalData;
  }

  try {
    const member = await loadMemberSnapshot();
    const [campaigns, rewards] = await Promise.all([loadCampaigns(member.tier), loadRewards()]);
    return {
      member,
      campaigns,
      rewards,
      source: "api",
    };
  } catch {
    return mockPortalData;
  }
}

export async function redeemReward(input: {
  reward: RewardItem;
  points: number;
}) {
  if (!API_BASE_URL) {
    const nextBalance = mockPortalData.member.points - input.points;
    if (nextBalance < 0) {
      throw new Error("Insufficient points balance.");
    }
    return { ok: true };
  }

  return requestJson<{
    ok: true;
    result: {
      newBalance: number;
      newTier: string;
      pointsDeducted: number;
    };
  }>("/api/points/redeem", {
    method: "POST",
    body: JSON.stringify({
      memberIdentifier: MEMBER_ID || MEMBER_EMAIL,
      fallbackEmail: MEMBER_EMAIL,
      points: input.points,
      reason: `${input.reward.name} Redemption`,
      transactionType: "REDEEM",
      rewardCatalogId: input.reward.rewardCatalogId ?? input.reward.id,
      promotionCampaignId: input.reward.activeFlashSaleId || null,
    }),
  });
}

export function formatRemainingTierPoints(points: number) {
  const nextTier = [...TIER_THRESHOLDS].reverse().find((entry) => points < entry.min);
  if (!nextTier) {
    return {
      label: "Maximum tier reached",
      percent: 100,
      currentTier: "Gold" as MemberSnapshot["tier"],
      target: points,
    };
  }

  const currentTier =
    [...TIER_THRESHOLDS].find((entry) => points >= entry.min)?.tier ?? "Bronze";
  const currentMin = TIER_THRESHOLDS.find((entry) => entry.tier === currentTier)?.min ?? 0;
  const range = Math.max(nextTier.min - currentMin, 1);
  const percent = Math.min(100, ((points - currentMin) / range) * 100);

  return {
    label: `${Math.max(nextTier.min - points, 0)} pts to ${nextTier.tier}`,
    percent,
    currentTier,
    target: nextTier.min,
  };
}
