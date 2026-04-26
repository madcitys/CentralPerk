import type { AdminMetrics } from "../admin-panel/types";
import type { MemberData, Reward, Transaction } from "../types/loyalty";
import type { AppNotification } from "./notifications";
import type { EarningRule } from "./loyalty-supabase";
import type { TierRule } from "./loyalty-engine";
import type { PromotionCampaign } from "./promotions";

export type PartnerDashboardRow = {
  partner: {
    id: string;
    partnerCode: string;
    partnerName: string;
    description: string | null;
    logoUrl: string | null;
    conversionRate: number;
    isActive: boolean;
  };
  totals: {
    transactions: number;
    pendingTransactions: number;
    settledTransactions: number;
    points: number;
    grossAmount: number;
    totalCommission: number;
  };
};

export const DEFAULT_TIER_RULES: TierRule[] = [
  { tier_label: "Bronze", min_points: 0 },
  { tier_label: "Silver", min_points: 250 },
  { tier_label: "Gold", min_points: 750 },
];

export const DEFAULT_EARNING_RULES: EarningRule[] = [
  { tier_label: "Bronze", peso_per_point: 10, multiplier: 1, is_active: true },
  { tier_label: "Silver", peso_per_point: 10, multiplier: 1.25, is_active: true },
  { tier_label: "Gold", peso_per_point: 10, multiplier: 1.5, is_active: true },
];

export const DEFAULT_SEGMENTS: Array<{ id: string; name: string; description: string | null; is_system: boolean }> = [];
export const DEFAULT_REWARDS: Reward[] = [];
export const DEFAULT_CAMPAIGNS: PromotionCampaign[] = [];
export const DEFAULT_NOTIFICATIONS: AppNotification[] = [];

export function ensureArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function ensureNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function ensureNumberRecord(
  value: Record<string, unknown> | null | undefined,
  seed: Record<string, number> = {},
) {
  const entries = Object.entries(value ?? {}).map(([key, entryValue]) => [key, ensureNumber(entryValue, 0)] as const);
  return { ...seed, ...Object.fromEntries(entries) };
}

export function createDefaultCommunicationAnalytics() {
  return {
    total: 0,
    byChannel: {
      email: 0,
      sms: 0,
      push: 0,
    } as Record<string, number>,
    byStatus: {} as Record<string, number>,
    recent: [] as Array<Record<string, unknown>>,
  };
}

export function createDefaultPartnerDashboardRow(name = "All Partners"): PartnerDashboardRow {
  return {
    partner: {
      id: "all",
      partnerCode: "all",
      partnerName: name,
      description: null,
      logoUrl: null,
      conversionRate: 1,
      isActive: true,
    },
    totals: {
      transactions: 0,
      pendingTransactions: 0,
      settledTransactions: 0,
      points: 0,
      grossAmount: 0,
      totalCommission: 0,
    },
  };
}

export function createDefaultTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: overrides.id ?? "",
    date: overrides.date ?? new Date(0).toISOString(),
    description: overrides.description ?? "Transaction",
    type: overrides.type ?? "earned",
    points: ensureNumber(overrides.points, 0),
    balance: ensureNumber(overrides.balance, 0),
    category: overrides.category,
    receiptId: overrides.receiptId,
  };
}

export function createDefaultMemberData(overrides: Partial<MemberData> = {}): MemberData {
  const tier =
    overrides.tier === "Gold" || overrides.tier === "Silver" || overrides.tier === "Bronze"
      ? overrides.tier
      : "Bronze";
  const status = overrides.status === "Inactive" ? "Inactive" : "Active";

  return {
    memberId: String(overrides.memberId ?? ""),
    fullName: String(overrides.fullName ?? "Member"),
    email: String(overrides.email ?? ""),
    phone: String(overrides.phone ?? ""),
    birthdate: String(overrides.birthdate ?? ""),
    address: String(overrides.address ?? ""),
    profileImage:
      String(overrides.profileImage ?? "") ||
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=300&q=80",
    tier,
    memberSince: String(overrides.memberSince ?? ""),
    status,
    points: ensureNumber(overrides.points, 0),
    pendingPoints: ensureNumber(overrides.pendingPoints, 0),
    lifetimePoints: ensureNumber(overrides.lifetimePoints, 0),
    expiringPoints: ensureNumber(overrides.expiringPoints, 0),
    daysUntilExpiry: ensureNumber(overrides.daysUntilExpiry, 0),
    earnedThisMonth: ensureNumber(overrides.earnedThisMonth, 0),
    redeemedThisMonth: ensureNumber(overrides.redeemedThisMonth, 0),
    transactions: ensureArray(overrides.transactions).map((transaction) => createDefaultTransaction(transaction)),
    profileComplete: Boolean(overrides.profileComplete),
    hasDownloadedApp: Boolean(overrides.hasDownloadedApp),
    surveysCompleted: ensureNumber(overrides.surveysCompleted, 0),
    badges: ensureArray(overrides.badges),
  };
}

export const DEFAULT_ADMIN_METRICS: AdminMetrics = {
  totalMembers: 0,
  activeMembers: 0,
  pointsLiability: 0,
  totalPointsRedeemed: 0,
  tierDistribution: {
    gold: 0,
    silver: 0,
    bronze: 0,
  },
  newMembersToday: 0,
  newMembersThisWeek: 0,
  newMembersThisMonth: 0,
  newMembersLastMonth: 0,
  growthRate: 0,
  growthSeries: [],
  earnedPointsSeries: [],
  redemptionSeries: [],
  memberSegments: [],
  memberActivityRows: [],
  rewardPopularity: [],
  redemptionRate: 0,
  tierMovementTrend: [],
  redemptionValuePerPoint: 0.01,
  monetaryLiability: 0,
  liabilityTrend: [],
};
