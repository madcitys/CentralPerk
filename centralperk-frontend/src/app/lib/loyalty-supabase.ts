// @ts-nocheck
import { supabase } from "../../utils/supabase/client";
import type { EarnOpportunity, MemberData, Reward, Transaction } from "../types/loyalty";
import { getCurrentCustomerSession, getStoredAccessTokenClaims } from "../auth/auth";
import { clearPendingEmailAlias } from "../auth/customer-auth";
import { queueMemberNotification } from "./notifications";
import { requestJson } from "./api";
import {
  DEFAULT_TIER_RULES,
  monthKey,
  normalizeTierLabel,
  normalizeTierRules,
  resolveTier,
  type SupportedTier,
  type TierRule,
} from "./loyalty-engine";
import {
  awardPointsViaService,
  fetchEarnTasksViaService,
  fetchEarningRules,
  fetchPointsActivityViaService,
  redeemPointsViaService,
  runExpiryViaService,
  fetchTierRulesViaService,
  saveEarningRulesViaService,
  saveTierRulesViaService,
} from "./points-service-client";
import { claimBirthdayReward, loadBirthdayRewardSettings, shouldAutoCreditBirthdayReward } from "./member-lifecycle";
import { loadMemberBadgeProgress } from "./promotions";
import {
  loadTierHistoryViaApi,
  recordMemberLoginActivityViaApi,
  updateMemberProfileViaApi,
} from "./member-service-api";

type AnyRecord = Record<string, any>;
let loyaltyTransactionIdCounter = 0;
const EARNING_RULE_CACHE_TTL_MS = 60_000;
const EARN_TASKS_CACHE_TTL_MS = 60_000;

const earningRuleCache = new Map<SupportedTier, { value: EarningRule; expiresAt: number }>();
const earningRuleRequests = new Map<SupportedTier, Promise<EarningRule>>();
let earnTasksCache: { value: EarnOpportunity[]; expiresAt: number } | null = null;
let earnTasksRequest: Promise<EarnOpportunity[]> | null = null;

// Demo toggle for profile email edits:
// Change this to `true` only if you want demo-only profile email edits that do not
// update the real Supabase Auth login email.
// Keep this `false` for real email changes so users can log in with the new email.
const DEMO_SKIP_AUTH_EMAIL_UPDATE = false;

function getMemberPk(member: AnyRecord): { key: string; value: any } | null {
  if (member?.id !== undefined) return { key: "id", value: member.id };
  if (member?.member_id !== undefined) return { key: "member_id", value: member.member_id };
  return null;
}

function toTitleCase(value: string): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function mapTxType(rawType: string): Transaction["type"] {
  const value = (rawType || "").toUpperCase();
  if (value === "PURCHASE" || value === "MANUAL_AWARD" || value === "EARN") return "earned";
  if (value === "REDEEM" || value === "REDEEMED" || value === "REWARD_REDEEMED") return "redeemed";
  if (value === "GIFT" || value === "TRANSFER") return "gifted";
  if (value === "EXPIRY_DEDUCTION" || value === "EXPIRED") return "expired";
  if (value === "PENDING") return "pending";
  return "earned";
}

function getTxDateValue(tx: AnyRecord): string {
  return String(tx.transaction_date ?? tx.created_at ?? new Date().toISOString());
}

function getTxTypeValue(tx: AnyRecord): string {
  return String(tx.transaction_type ?? tx.change_type ?? "");
}

function getTxSignedPoints(tx: AnyRecord): number {
  return Number(tx.points ?? tx.points_delta ?? 0);
}

function getTxBalanceValue(tx: AnyRecord): number | null {
  const rawBalance = tx.balance ?? tx.balance_after;
  if (rawBalance === null || rawBalance === undefined || rawBalance === "") return null;
  const parsed = Number(rawBalance);
  return Number.isFinite(parsed) ? sanitizePointsBalance(parsed) : null;
}

function sanitizePointsBalance(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function getTransactionNote(row: AnyRecord): string {
  return String(row.reason ?? row.description ?? "");
}

function shouldFallbackFromServiceError(error: unknown): boolean {
  if (usesStrictMicroservices()) return false;

  const message = String(
    (error as { message?: unknown })?.message ??
      (error as { cause?: { message?: unknown } })?.cause?.message ??
      ""
  ).toLowerCase();
  const causeCode = String((error as { cause?: { code?: unknown } })?.cause?.code ?? "").toLowerCase();

  return (
    message.includes("fetch failed") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("failed to parse url") ||
    message.includes("network") ||
    causeCode === "econnrefused" ||
    causeCode === "enotfound"
  );
}

function usesStrictMicroservices(): boolean {
  return (
    process.env.USE_SPLIT_SERVICE_DATABASES === "true" ||
    process.env.NEXT_PUBLIC_USE_SPLIT_SERVICE_DATABASES === "true" ||
    process.env.USE_REMOTE_LOYALTY_API === "true" ||
    process.env.NEXT_PUBLIC_USE_REMOTE_LOYALTY_API === "true"
  );
}

async function loadPointsActivityFromService(memberIdentifier: string, fallbackEmail?: string) {
  try {
    const response = await fetchPointsActivityViaService(memberIdentifier, fallbackEmail);
    if (response?.ok) return response;
  } catch (error) {
    if (usesStrictMicroservices()) throw error;
  }
  return null;
}

function shouldUseServiceActivity(activity: Awaited<ReturnType<typeof loadPointsActivityFromService>>) {
  return Boolean(activity && (usesStrictMicroservices() || (activity.history || []).length > 0));
}

function normalizeResolvedMember(row: AnyRecord | null | undefined): AnyRecord | null {
  if (!row) return null;

  const firstName = row.first_name ?? row.firstName ?? "";
  const lastName = row.last_name ?? row.lastName ?? "";
  const memberNumber = row.member_number ?? row.memberNumber ?? row.member_id ?? row.memberId ?? row.id ?? "";
  const pointsBalance = sanitizePointsBalance(row.points_balance ?? row.pointsBalance ?? 0);

  return {
    ...row,
    id: row.id ?? row.member_id ?? row.memberId ?? memberNumber,
    member_id: row.member_id ?? row.memberId ?? row.id ?? memberNumber,
    member_number: String(memberNumber || ""),
    first_name: firstName ? String(firstName) : null,
    last_name: lastName ? String(lastName) : null,
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    birthdate: row.birthdate ?? null,
    address: row.address ?? null,
    profile_photo_url: row.profile_photo_url ?? row.profilePhotoUrl ?? null,
    enrollment_date: row.enrollment_date ?? row.enrollmentDate ?? null,
    points_balance: pointsBalance,
    tier: String(row.tier || "Bronze"),
  };
}

async function resolveMemberViaApi(memberIdentifier?: string, fallbackEmail?: string, fullName?: string) {
  const params = new URLSearchParams();
  const normalizedIdentifier = String(memberIdentifier || "").trim();
  const normalizedEmail = String(fallbackEmail || "").trim();
  const normalizedName = String(fullName || "").trim();

  if (normalizedIdentifier) params.set("identifier", normalizedIdentifier);
  if (normalizedEmail) params.set("fallbackEmail", normalizedEmail);
  if (normalizedName && normalizedName.toLowerCase() !== "member") params.set("name", normalizedName);
  if (!params.toString()) return null;

  const response = await requestJson<{ ok?: boolean; member?: AnyRecord }>(`/api/members/resolve?${params.toString()}`);
  return normalizeResolvedMember(response.member);
}

function currentUserTransactionsToRaw(user: MemberData): AnyRecord[] {
  return (user.transactions || []).map((tx) => {
    const positivePoints = Math.max(0, Math.floor(Number(tx.points) || 0));
    let transactionType = "EARN";
    let signedPoints = positivePoints;

    if (tx.type === "redeemed") {
      transactionType = "REDEEM";
      signedPoints = -positivePoints;
    } else if (tx.type === "gifted") {
      transactionType = "GIFT";
      signedPoints = -positivePoints;
    } else if (tx.type === "expired") {
      transactionType = "EXPIRY_DEDUCTION";
      signedPoints = -positivePoints;
    } else if (tx.type === "pending") {
      transactionType = "PENDING";
      signedPoints = positivePoints;
    }

    return {
      transaction_id: tx.id,
      transaction_type: transactionType,
      points: signedPoints,
      balance: tx.balance,
      transaction_date: tx.date,
      reason: tx.description,
      receipt_id: tx.receiptId,
    };
  });
}

function nextLoyaltyTransactionId(): number {
  loyaltyTransactionIdCounter = (loyaltyTransactionIdCounter + 1) % 100;
  return Date.now() * 100 + loyaltyTransactionIdCounter;
}

function withTransactionId(payload: AnyRecord): AnyRecord {
  const rawTransactionId = payload.transaction_id;
  if (typeof rawTransactionId === "number" && Number.isSafeInteger(rawTransactionId) && rawTransactionId > 0) {
    return { ...payload, transaction_id: rawTransactionId };
  }

  if (typeof rawTransactionId === "string" && /^\d+$/.test(rawTransactionId.trim())) {
    const parsedTransactionId = Number(rawTransactionId.trim());
    if (Number.isSafeInteger(parsedTransactionId) && parsedTransactionId > 0) {
      return { ...payload, transaction_id: parsedTransactionId };
    }
  }

  return {
    ...payload,
    transaction_id: nextLoyaltyTransactionId(),
  };
}

function isMissingColumnError(error: unknown, table: string, column: string): boolean {
  const message = String(
    (error as { message?: unknown; details?: unknown; hint?: unknown })?.message ??
      (error as { details?: unknown })?.details ??
      (error as { hint?: unknown })?.hint ??
      ""
  ).toLowerCase();

  return (
    message.includes(`column ${table}.${column} does not exist`) ||
    message.includes(`could not find the '${column}' column`) ||
    (message.includes(column.toLowerCase()) && message.includes("does not exist"))
  );
}

function isMissingRelationError(error: unknown, table: string): boolean {
  const message = String(
    (error as { message?: unknown; details?: unknown; hint?: unknown })?.message ??
      (error as { details?: unknown })?.details ??
      (error as { hint?: unknown })?.hint ??
      ""
  ).toLowerCase();

  return (
    message.includes(`relation "${table.toLowerCase()}" does not exist`) ||
    message.includes(`relation "public.${table.toLowerCase()}" does not exist`) ||
    message.includes(`could not find the table 'public.${table.toLowerCase()}' in the schema cache`) ||
    message.includes(`could not find the table "${table.toLowerCase()}" in the schema cache`) ||
    message.includes(`could not find the table '${table.toLowerCase()}' in the schema cache`) ||
    (message.includes(table.toLowerCase()) && message.includes("schema cache")) ||
    (message.includes(table.toLowerCase()) && message.includes("does not exist"))
  );
}

async function insertLoyaltyTransaction(payload: AnyRecord): Promise<void> {
  throw new Error("Direct loyalty transaction writes are disabled. Use the Points Service API instead.");
}

const WELCOME_PACKAGE_REASON = "Welcome Package Bonus";
const WELCOME_PACKAGE_POINTS = 100;

export const DEFAULT_EARN_TASKS: EarnOpportunity[] = [
  {
    id: "E001",
    title: "Complete Your Profile",
    description: "Add your birthday, phone number, and preferences",
    points: 100,
    icon: "user",
    active: true,
  },
  {
    id: "E002",
    title: "Download Mobile App",
    description: "Get the GREENOVATE pharmacy rewards app on your phone",
    points: 50,
    icon: "smartphone",
    active: true,
  },
  {
    id: "E003",
    title: "Monthly Survey",
    description: "Share your feedback about our service",
    points: 50,
    icon: "clipboard",
    active: true,
  },
  {
    id: "E004",
    title: "Refer a Friend",
    description: "Both get 250 points when they make first purchase",
    points: 250,
    icon: "users",
    active: true,
  },
  {
    id: "E005",
    title: "Follow on Social Media",
    description: "Follow us on Instagram and Facebook",
    points: 30,
    icon: "share-2",
    active: true,
  },
  {
    id: "E006",
    title: "Leave a Review",
    description: "Rate your experience on Google or App Store",
    points: 75,
    icon: "star",
    active: true,
  },
];

async function ensureWelcomePackageNotification(member: AnyRecord, memberPk: { key: string; value: any }) {
  await queueMemberNotification({
    memberId: String(member.member_number || memberPk.value),
    channel: "email",
    subject: "Welcome to GREENOVATE Rewards",
    message: `Hi ${String(member.first_name || "Member")}, welcome to GREENOVATE Rewards! Your Member ID is ${String(member.member_number || "Pending ID")}. Program basics: earn points on purchases, redeem rewards in-app, and monitor expiry alerts in your dashboard.`,
    isTransactional: true,
  });
}

async function ensureMemberTransactionNotification(input: {
  member: AnyRecord;
  memberPk: { key: string; value: any };
  subject: string;
  message: string;
}) {
  await queueMemberNotification({
    memberId: String(input.member.member_number || input.memberPk.value),
    channel: "push",
    subject: input.subject,
    message: input.message,
    isTransactional: true,
  });
}

async function queueCampaignBonusNotification(input: {
  member: AnyRecord;
  memberPk: { key: string; value: any };
  bonusPointsAdded: number;
  appliedCampaigns: PurchaseCampaignBonus[];
}) {
  if (input.bonusPointsAdded <= 0 || input.appliedCampaigns.length === 0) return;

  const campaignNames = input.appliedCampaigns
    .map((campaign) => campaign.campaign_name)
    .filter(Boolean)
    .join(", ");

  await ensureMemberTransactionNotification({
    member: input.member,
    memberPk: input.memberPk,
    subject: "Campaign Bonus Applied",
    message: `Hi ${String(input.member.first_name || "Member")}, you received ${input.bonusPointsAdded} bonus points from ${campaignNames}.`,
  });
}

export type EarningRule = {
  tier_label: SupportedTier;
  peso_per_point: number;
  multiplier: number;
  is_active: boolean;
};

type PurchaseCampaignBonus = {
  campaign_id: string;
  campaign_name: string;
  campaign_type: "bonus_points" | "multiplier_event";
  awarded_points: number;
  applied_multiplier: number;
  minimum_purchase_amount: number;
};

async function grantWelcomePackageForMember(member: AnyRecord, memberPk: { key: string; value: any }) {
  const memberIdentifier = String(member.member_number || member.member_id || memberPk.value);
  const fallbackEmail = member.email ? String(member.email) : undefined;
  const activity = await loadPointsActivityFromService(memberIdentifier, fallbackEmail);
  const existingWelcome = (activity?.history || []).some((row: AnyRecord) => getTransactionNote(row) === WELCOME_PACKAGE_REASON);
  if (existingWelcome) {
    await ensureWelcomePackageNotification(member, memberPk).catch((error) => {
      console.warn("Welcome package notification could not be queued:", error);
    });
    return {
      granted: false,
      pointsAdded: 0,
      newBalance: sanitizePointsBalance(activity?.balance?.points_balance ?? member.points_balance ?? 0),
      newTier: normalizeTierLabel(String(activity?.balance?.tier ?? member.tier ?? "Bronze")) as SupportedTier,
    };
  }

  const serviceResponse = await awardPointsViaService(
    {
      memberIdentifier,
      fallbackEmail,
      points: WELCOME_PACKAGE_POINTS,
      transactionType: "MANUAL_AWARD",
      reason: WELCOME_PACKAGE_REASON,
    },
    `welcome-package-${memberIdentifier}`
  );

  const result = serviceResponse?.result ?? {};
  await ensureWelcomePackageNotification(member, memberPk).catch((error) => {
    console.warn("Welcome package notification could not be queued:", error);
  });

  return {
    granted: true,
    pointsAdded: Number(result.pointsAdded ?? WELCOME_PACKAGE_POINTS),
    newBalance: sanitizePointsBalance(result.newBalance ?? member.points_balance ?? 0),
    newTier: normalizeTierLabel(String(result.newTier ?? member.tier ?? "Bronze")) as SupportedTier,
  };
}

async function readMemberBalanceSnapshot(
  memberPk: { key: string; value: any },
  fallbackBalance = 0
): Promise<{ newBalance: number; newTier: SupportedTier }> {
  const rules = await fetchTierRules();
  const refreshedMember = await resolveMemberViaApi(String(memberPk.value)).catch(() => null);

  const newBalance = sanitizePointsBalance(refreshedMember?.points_balance ?? fallbackBalance);
  const newTier = normalizeTierLabel(
    String(refreshedMember?.tier ?? resolveTier(newBalance, rules))
  ) as SupportedTier;

  return { newBalance, newTier };
}

async function processMemberExpiredPoints(memberPk: { key: string; value: any }) {
  return;
}

export async function processAllMemberExpiredPoints() {
  const serviceResponse = await runExpiryViaService();
  return serviceResponse?.result;
}

export async function fetchTierRules(): Promise<TierRule[]> {
  try {
    const response = await fetchTierRulesViaService();
    if (response?.ok && Array.isArray(response.tiers)) {
      return normalizeTierRules(response.tiers as TierRule[]);
    }
  } catch (error) {
    if (usesStrictMicroservices()) throw error;
  }
  return DEFAULT_TIER_RULES;
}

export async function saveTierRules(rules: TierRule[]): Promise<void> {
  await saveTierRulesViaService(
    normalizeTierRules(rules).map((rule) => ({
      tier_label: normalizeTierLabel(rule.tier_label),
      min_points: Math.max(0, Math.floor(Number(rule.min_points) || 0)),
      is_active: true,
    })),
  );
}


export async function fetchActiveEarningRules(): Promise<EarningRule[]> {
  const fallback = [
    { tier_label: "Bronze", peso_per_point: 10, multiplier: 1, is_active: true },
    { tier_label: "Silver", peso_per_point: 10, multiplier: 1.25, is_active: true },
    { tier_label: "Gold", peso_per_point: 10, multiplier: 1.5, is_active: true },
  ] as EarningRule[];

  const response = await fetchEarningRules().catch((error) => {
    if (usesStrictMicroservices()) throw error;
    return null;
  });
  const rows = response?.ok && Array.isArray(response.earningRules) ? response.earningRules : fallback;

  const latestByTier = new Map<SupportedTier, EarningRule>();
  for (const row of rows as AnyRecord[]) {
    const tier = normalizeTierLabel(String(row.tier_label)) as SupportedTier;
    if (latestByTier.has(tier)) continue;
    latestByTier.set(tier, {
      tier_label: tier,
      peso_per_point: Number(row.peso_per_point || 10),
      multiplier: Number(row.multiplier || 1),
      is_active: Boolean(row.is_active ?? true),
    });
  }

  return (["Bronze", "Silver", "Gold"] as SupportedTier[]).map((tier) =>
    latestByTier.get(tier) || { tier_label: tier, peso_per_point: 10, multiplier: 1, is_active: true }
  );
}

export async function saveEarningRules(rules: EarningRule[]): Promise<void> {
  const payload = rules.map((rawRule) => {
    const tier = normalizeTierLabel(rawRule.tier_label) as SupportedTier;
    return {
      tier_label: tier,
      peso_per_point: Math.max(0.01, Number(rawRule.peso_per_point) || 10),
      multiplier: Math.max(0.01, Number(rawRule.multiplier) || 1),
      is_active: true,
    };
  });

  await saveEarningRulesViaService(payload);

  earningRuleCache.clear();
  earningRuleRequests.clear();
}

async function fetchEarningRuleForTier(tier: SupportedTier): Promise<EarningRule> {
  const cached = earningRuleCache.get(tier);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const inFlight = earningRuleRequests.get(tier);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    const rules = await fetchActiveEarningRules();
    const data = rules.find((rule) => normalizeTierLabel(String(rule.tier_label)) === tier);

    const resolved: EarningRule = !data
      ? { tier_label: tier, peso_per_point: 10, multiplier: 1, is_active: true }
      : {
          tier_label: normalizeTierLabel(String(data.tier_label)) as SupportedTier,
          peso_per_point: Number(data.peso_per_point || 10),
          multiplier: Number(data.multiplier || 1),
          is_active: Boolean(data.is_active ?? true),
        };

    earningRuleCache.set(tier, {
      value: resolved,
      expiresAt: Date.now() + EARNING_RULE_CACHE_TTL_MS,
    });

    return resolved;
  })();

  earningRuleRequests.set(tier, request);
  try {
    return await request;
  } finally {
    earningRuleRequests.delete(tier);
  }
}

export async function calculateDynamicPurchasePoints(input: {
  amountSpent: number;
  tier: SupportedTier;
}): Promise<number> {
  const amount = Math.max(0, Number(input.amountSpent) || 0);
  const rule = await fetchEarningRuleForTier(input.tier);
  const basePoints = Math.floor(amount / Math.max(rule.peso_per_point, 0.01));
  return Math.max(0, Math.floor(basePoints * Math.max(rule.multiplier, 0.01)));
}

async function loadPurchaseCampaignBonuses(input: {
  memberId: number;
  purchaseAmount: number;
  basePoints: number;
  memberTier: SupportedTier;
  productScope?: string;
}): Promise<PurchaseCampaignBonus[]> {
  return [];
}

async function refreshMemberBadges(memberId: number) {
  return;
}

async function queueNewBadgeNotifications(input: {
  member: AnyRecord;
  memberPk: { key: string; value: any };
  previousEarnedBadgeIds: Set<string>;
}) {
  const badgeProgress = await loadMemberBadgeProgress(
    String(input.member.member_number || input.memberPk.value),
    String(input.member.email || "")
  ).catch(() => []);

  const newlyEarnedBadges = badgeProgress.filter(
    (badge) => badge.isEarned && !input.previousEarnedBadgeIds.has(String(badge.badgeId))
  );

  for (const badge of newlyEarnedBadges) {
    await ensureMemberTransactionNotification({
      member: input.member,
      memberPk: input.memberPk,
      subject: "Badge unlocked",
      message: `You earned the ${badge.badgeName} badge.`,
    });
  }
}

async function loadActiveFlashSaleCampaignForReward(rewardCatalogId: string | number) {
  const response = await requestJson<{ ok: true; campaigns: AnyRecord[] }>("/api/campaigns/active").catch(() => ({
    ok: true as const,
    campaigns: [] as AnyRecord[],
  }));
  const now = Date.now();
  const active = (response.campaigns || []).find((row) => {
    const campaignType = String(row.campaignType ?? row.campaign_type ?? "");
    const rewardId = row.rewardId ?? row.reward_id;
    const startsAt = new Date(String(row.startsAt ?? row.starts_at ?? "")).getTime();
    const endsAt = new Date(String(row.endsAt ?? row.ends_at ?? "")).getTime();
    return campaignType === "flash_sale" && String(rewardId) === String(rewardCatalogId) && startsAt <= now && endsAt >= now;
  });

  return active || null;
}

export async function loadRewardsCatalog(): Promise<Reward[]> {
  const rewardsResponse = await requestJson<{ ok: true; rewards: AnyRecord[] }>("/api/rewards");
  const rewardRows = (rewardsResponse.rewards || []).filter((row) => Boolean(row.is_active ?? row.available ?? true));
  const campaignsResponse = await requestJson<{ ok: true; campaigns: AnyRecord[] }>("/api/campaigns/active").catch((error) => {
    if (usesStrictMicroservices()) throw error;
    return {
      ok: true as const,
      campaigns: [] as AnyRecord[],
    };
  });
  const flashSaleByReward = new Map<string, AnyRecord>();
  for (const row of campaignsResponse.campaigns || []) {
    const campaignType = String(row.campaignType ?? row.campaign_type ?? "");
    const rewardId = row.rewardId ?? row.reward_id;
    if (campaignType !== "flash_sale" || rewardId === undefined || rewardId === null) continue;
    flashSaleByReward.set(String(rewardId), row);
  }

  return rewardRows.map((row) => {
    const partner = row.reward_partners as AnyRecord | null;
    const rewardCatalogId = row.rewardCatalogId ?? row.id ?? null;
    const flashSale = rewardCatalogId ? flashSaleByReward.get(String(rewardCatalogId)) : null;

    return {
      id: String(row.reward_id ?? row.id ?? ""),
      rewardCatalogId: rewardCatalogId ? String(rewardCatalogId) : undefined,
      name: String(row.name ?? "Reward"),
      description: String(row.description ?? ""),
      pointsCost: Number(row.pointsCost ?? row.points_cost ?? 0),
      category: String(row.category ?? "voucher") as Reward["category"],
      imageUrl: row.imageUrl ? String(row.imageUrl) : row.image_url ? String(row.image_url) : undefined,
      available: Boolean(row.available ?? row.is_active ?? true),
      expiryDate: row.expiryDate ? String(row.expiryDate) : row.expiry_date ? String(row.expiry_date) : undefined,
      partnerId: partner?.id ? String(partner.id) : row.partnerId ? String(row.partnerId) : row.partner_id ? String(row.partner_id) : null,
      partnerName: row.partnerName ? String(row.partnerName) : partner?.partner_name ? String(partner.partner_name) : row.partner_name ? String(row.partner_name) : null,
      partnerCode: row.partnerCode ? String(row.partnerCode) : partner?.partner_code ? String(partner.partner_code) : row.partner_code ? String(row.partner_code) : null,
      partnerLogoUrl: row.partnerLogoUrl ? String(row.partnerLogoUrl) : partner?.logo_url ? String(partner.logo_url) : row.partner_logo_url ? String(row.partner_logo_url) : null,
      partnerConversionRate:
        row.partnerConversionRate !== undefined && row.partnerConversionRate !== null
          ? Number(row.partnerConversionRate)
          : partner?.conversion_rate !== undefined && partner?.conversion_rate !== null
            ? Number(partner.conversion_rate)
            : row.partner_conversion_rate !== undefined && row.partner_conversion_rate !== null
              ? Number(row.partner_conversion_rate)
              : null,
      cashValue: row.cash_value !== undefined && row.cash_value !== null ? Number(row.cash_value) : null,
      activeFlashSaleId: flashSale?.id ? String(flashSale.id) : null,
      flashSaleStartsAt: flashSale?.startsAt ? String(flashSale.startsAt) : flashSale?.starts_at ? String(flashSale.starts_at) : null,
      flashSaleEndsAt: flashSale?.endsAt ? String(flashSale.endsAt) : flashSale?.ends_at ? String(flashSale.ends_at) : null,
      flashSaleQuantityLimit:
        flashSale?.flashSaleQuantityLimit !== undefined && flashSale?.flashSaleQuantityLimit !== null
          ? Number(flashSale.flashSaleQuantityLimit)
          : flashSale?.flash_sale_quantity_limit !== undefined && flashSale?.flash_sale_quantity_limit !== null
            ? Number(flashSale.flash_sale_quantity_limit)
            : null,
      flashSaleClaimedCount: Number(flashSale?.flashSaleClaimedCount ?? flashSale?.flash_sale_claimed_count ?? 0),
      flashSaleBanner: flashSale?.bannerTitle ? String(flashSale.bannerTitle) : flashSale?.bannerMessage ? String(flashSale.bannerMessage) : null,
      flashSaleCountdownLabel: flashSale?.countdownLabel ? String(flashSale.countdownLabel) : null,
    } satisfies Reward;
  });
}

export async function loadEarnTasks(): Promise<EarnOpportunity[]> {
  if (earnTasksCache && earnTasksCache.expiresAt > Date.now()) {
    return earnTasksCache.value;
  }

  if (earnTasksRequest) {
    return earnTasksRequest;
  }

  earnTasksRequest = (async () => {
    const response = await fetchEarnTasksViaService().catch((error) => {
      if (usesStrictMicroservices()) throw error;
      return null;
    });
    const data = response?.ok && Array.isArray(response.earnTasks) ? response.earnTasks : null;

    const resolved = !data
      ? DEFAULT_EARN_TASKS
      : (data as AnyRecord[]).map((row) => ({
          id: String(row.task_code ?? row.id ?? ""),
          title: String(row.title ?? "Task"),
          description: String(row.description ?? ""),
          points: Number(row.points ?? 0),
          icon: String(row.icon_key ?? "user"),
          completed: false,
          active: Boolean(row.is_active ?? true),
        }));

    earnTasksCache = {
      value: resolved,
      expiresAt: Date.now() + EARN_TASKS_CACHE_TTL_MS,
    };

    return resolved;
  })();

  try {
    return await earnTasksRequest;
  } finally {
    earnTasksRequest = null;
  }
}

export async function ensureWelcomePackage(memberIdentifier: string, fallbackEmail?: string) {
  const member = await findMember(memberIdentifier, fallbackEmail);
  if (!member) throw new Error("Member not found in loyalty_members.");
  const memberPk = getMemberPk(member);
  if (!memberPk) throw new Error("Member primary key is missing.");
  return grantWelcomePackageForMember(member, memberPk);
}

export async function findMember(memberIdentifier?: string, fallbackEmail?: string) {
  const localSession = getCurrentCustomerSession();
  const authRes = await supabase.auth.getUser();
  const authEmail = authRes.data.user?.email?.trim();
  const candidates = [
    { identifier: memberIdentifier?.trim(), email: fallbackEmail?.trim() },
    { identifier: localSession?.memberId?.trim(), email: localSession?.email?.trim() },
    { identifier: undefined, email: authEmail },
  ];

  let lastError: unknown = null;
  for (const candidate of candidates) {
    if (!candidate.identifier && !candidate.email) continue;
    try {
      const member = await resolveMemberViaApi(candidate.identifier, candidate.email);
      if (member) return member;
    } catch (error) {
      lastError = error;
      if (usesStrictMicroservices()) throw error;
    }
  }

  if (lastError && usesStrictMicroservices()) throw lastError;
  return null;
}

export async function loadMemberSnapshot(currentUser: MemberData): Promise<Partial<MemberData> | null> {
  const localSession = getCurrentCustomerSession();
  const tokenClaims = getStoredAccessTokenClaims();
  const authRes = await supabase.auth.getUser();
  const authEmail = String(authRes.data.user?.email || tokenClaims?.email || localSession?.email || "").trim().toLowerCase();
  const authUser = authRes.data.user;
  const tokenMemberNumber = String(
    tokenClaims?.user_metadata?.member_number ||
      tokenClaims?.user_metadata?.member_id ||
      ""
  ).trim();
  const tokenFullName =
    tokenClaims?.user_metadata?.full_name ||
    [tokenClaims?.user_metadata?.first_name, tokenClaims?.user_metadata?.last_name].filter(Boolean).join(" ").trim();
  const memberLookupId = localSession?.memberId || tokenMemberNumber || currentUser.memberId;
  const memberLookupEmail = authEmail || localSession?.email || currentUser.email;
  const member =
    (await resolveMemberViaApi(memberLookupId, memberLookupEmail, currentUser.fullName).catch(() => null)) ??
    (await findMember(memberLookupId, memberLookupEmail));
  if (!member) {
    const authFullName =
      String(authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || tokenFullName || "").trim() || currentUser.fullName;

    return {
      fullName: authFullName || localSession?.fullName || "Member",
      email: String(authUser?.email || tokenClaims?.email || localSession?.email || currentUser.email || ""),
      memberId: memberLookupId || currentUser.memberId,
    };
  }

  const rules = await fetchTierRules();
  const pk = getMemberPk(member);
  if (!pk) return null;

  await grantWelcomePackageForMember(member, pk).catch(() => undefined);
  await processMemberExpiredPoints(pk).catch(() => undefined);
  if (
    shouldAutoCreditBirthdayReward(
      {
        birthdate: String(member.birthdate || currentUser.birthdate || ""),
      },
      loadBirthdayRewardSettings()
    )
  ) {
    await claimBirthdayReward(String(member.member_number || currentUser.memberId), String(member.email || currentUser.email)).catch(() => undefined);
  }

  const refreshedMember =
    (await resolveMemberViaApi(String(member.member_number || memberLookupId), String(member.email || memberLookupEmail || "")).catch(() => null)) ??
    member;
  let serviceActivity: Awaited<ReturnType<typeof loadPointsActivityFromService>> = null;
  try {
    serviceActivity = await loadPointsActivityFromService(
      String(refreshedMember.member_number || memberLookupId || currentUser.memberId),
      String(refreshedMember.email || memberLookupEmail || currentUser.email || "") || undefined
    );
  } catch {
    serviceActivity = null;
  }
  const useServiceActivity = shouldUseServiceActivity(serviceActivity);
  const currentBalance = sanitizePointsBalance(
    (useServiceActivity ? serviceActivity?.balance?.points_balance : undefined) ??
      refreshedMember.points_balance ??
      currentUser.points ??
      0
  );

  let rawTx: AnyRecord[] = [];
  if (useServiceActivity) {
    rawTx = (serviceActivity?.history || []) as AnyRecord[];
  } else {
    rawTx = currentUserTransactionsToRaw(currentUser);
  }
  const completedTaskIds = new Set(
    rawTx
      .map((tx) => String(getTransactionNote(tx) || "").match(/Task completed \(([^)]+)\)/i)?.[1] ?? null)
      .filter((taskId): taskId is string => Boolean(taskId))
  );

  let runningBalance = currentBalance;
  const transactions: Transaction[] = rawTx.map((tx, index) => {
    const signedPoints = getTxSignedPoints(tx);
    const mappedType = mapTxType(getTxTypeValue(tx));
    const txBalance = getTxBalanceValue(tx);
    const mapped: Transaction = {
      id: String(tx.transaction_id ?? tx.id ?? `${index}`),
      date: getTxDateValue(tx),
      description: String(getTransactionNote(tx) || getTxTypeValue(tx) || "Transaction"),
      type: mappedType,
      points: Math.abs(signedPoints),
      balance: txBalance ?? runningBalance,
      category: getTransactionNote(tx) ? "System" : "Purchase",
      receiptId: tx.receipt_id ? String(tx.receipt_id) : undefined,
    };
    if (mappedType !== "pending") {
      runningBalance = (txBalance ?? runningBalance) - signedPoints;
    }
    return mapped;
  });

  const nowMonth = monthKey(new Date());
  const isCurrentMonthTx = (tx: AnyRecord) => monthKey(getTxDateValue(tx)) === nowMonth;
  const pendingPoints = rawTx
    .filter((tx) => mapTxType(getTxTypeValue(tx)) === "pending" && getTxSignedPoints(tx) > 0)
    .reduce((sum, tx) => sum + getTxSignedPoints(tx), 0);

  const earnedThisMonth = rawTx
    .filter(
      (tx) =>
        mapTxType(getTxTypeValue(tx)) === "earned" &&
        getTxSignedPoints(tx) > 0 &&
        isCurrentMonthTx(tx)
    )
    .reduce((sum, tx) => sum + getTxSignedPoints(tx), 0);

  const redeemedThisMonth = rawTx
    .filter(
      (tx) =>
        mapTxType(getTxTypeValue(tx)) === "redeemed" &&
        getTxSignedPoints(tx) !== 0 &&
        isCurrentMonthTx(tx)
    )
    .reduce((sum, tx) => sum + Math.abs(getTxSignedPoints(tx)), 0);

  const rawLifetimePoints = rawTx
    .filter(
      (tx) => mapTxType(getTxTypeValue(tx)) === "earned" && getTxSignedPoints(tx) > 0
    )
    .reduce((sum, tx) => sum + getTxSignedPoints(tx), 0);
  const lifetimePoints = rawLifetimePoints;
  const surveysCompleted = Math.max(
    Number(currentUser.surveysCompleted || 0),
    rawTx.filter((tx) => /Task completed \(E003\)/i.test(String(getTransactionNote(tx) || ""))).length
  );
  const profileComplete = Boolean(
    String(refreshedMember.first_name || "").trim() &&
      String(refreshedMember.last_name || "").trim() &&
      String(refreshedMember.phone || currentUser.phone || "").trim() &&
      String(refreshedMember.birthdate || currentUser.birthdate || "").trim()
  );
  const hasDownloadedApp = completedTaskIds.has("E002") || Boolean(currentUser.hasDownloadedApp);

  const upcomingExpiring = rawTx.filter((tx) => {
    if (!tx.expiry_date) return false;
    const expiryDate = new Date(tx.expiry_date);
    const ms = expiryDate.getTime() - Date.now();
    const days = ms / (1000 * 60 * 60 * 24);
    return getTxSignedPoints(tx) > 0 && days >= 0 && days <= 30;
  });

  const expiringPoints = upcomingExpiring.reduce((sum, tx) => sum + getTxSignedPoints(tx), 0);
  const nearestDays = upcomingExpiring.length
    ? Math.max(
        0,
        Math.min(
          ...upcomingExpiring.map((tx) =>
            Math.ceil((new Date(tx.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          )
        )
      )
    : 0;

  const tier = normalizeTierLabel(resolveTier(currentBalance, rules)) as MemberData["tier"];
  let badges = currentUser.badges || [];

  try {
    badges = await loadMemberBadgeProgress(String(refreshedMember.member_number || currentUser.memberId), String(refreshedMember.email || currentUser.email));
  } catch {
    badges = currentUser.badges || [];
  }

  return {
    memberId: String(refreshedMember.member_number || currentUser.memberId),
    fullName: `${refreshedMember.first_name || ""} ${refreshedMember.last_name || ""}`.trim() || currentUser.fullName,
    email: String(refreshedMember.email || currentUser.email),
    phone: String(refreshedMember.phone || currentUser.phone),
    birthdate: refreshedMember.birthdate ? String(refreshedMember.birthdate) : String(currentUser.birthdate || ""),
    address: String(refreshedMember.address || currentUser.address || ""),
    profileImage: String(refreshedMember.profile_photo_url || currentUser.profileImage || ""),
    memberSince: refreshedMember.enrollment_date
      ? new Date(refreshedMember.enrollment_date).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : currentUser.memberSince,
    points: currentBalance,
    pendingPoints,
    lifetimePoints,
    earnedThisMonth,
    redeemedThisMonth,
    profileComplete,
    hasDownloadedApp,
    surveysCompleted,
    expiringPoints,
    daysUntilExpiry: nearestDays,
    tier,
    transactions,
    badges,
  };
}

export async function loadMemberActivity(memberIdentifier: string, fallbackEmail?: string) {
  const member = await findMember(memberIdentifier, fallbackEmail);
  if (!member) throw new Error("Member not found in loyalty_members.");
  const pk = getMemberPk(member);
  if (!pk) throw new Error("Member primary key is missing.");

  const rules = await fetchTierRules();
  const serviceActivity = await loadPointsActivityFromService(
    String(member.member_number || memberIdentifier),
    String(member.email || fallbackEmail || "") || undefined
  );
  if (shouldUseServiceActivity(serviceActivity)) {
    const balance = sanitizePointsBalance(serviceActivity?.balance?.points_balance ?? member.points_balance ?? 0);
    return {
      balance: {
        member_id: String(serviceActivity?.balance?.member_id || member.member_number || memberIdentifier),
        points_balance: balance,
        tier: normalizeTierLabel(String(serviceActivity?.balance?.tier ?? resolveTier(balance, rules))),
      },
      history: ((serviceActivity?.history || []) as AnyRecord[]).map((tx) => ({
        type: getTxTypeValue(tx),
        points: getTxSignedPoints(tx),
        balance: getTxBalanceValue(tx),
        date: getTxDateValue(tx),
        expiry_date: tx.expiry_date ? String(tx.expiry_date) : null,
        reason: getTransactionNote(tx),
      })),
    };
  }

  return {
    balance: {
      member_id: String(member.member_number || memberIdentifier),
      points_balance: Number(member.points_balance || 0),
      tier: resolveTier(Number(member.points_balance || 0), rules),
    },
    history: [],
  };
}

export async function awardMemberPoints(input: {
  memberIdentifier: string;
  fallbackEmail?: string;
  points: number;
  transactionType: "PURCHASE" | "MANUAL_AWARD" | "EARN";
  reason: string;
  amountSpent?: number;
  productCode?: string;
  productCategory?: string;
  idempotencyKey?: string;
}) {
  try {
    const serviceResponse = await awardPointsViaService(
      input,
      input.idempotencyKey || `award-${input.memberIdentifier}-${input.transactionType}-${input.reason}-${input.points}`
    );
    if (serviceResponse?.ok) return serviceResponse.result;
    throw new Error("Points service award failed.");
  } catch (error) {
    throw error;
  }
  throw new Error("Points Service award endpoint did not return a usable result.");
}

export async function redeemMemberPoints(input: {
  memberIdentifier: string;
  fallbackEmail?: string;
  points: number;
  reason: string;
  transactionType?: "REDEEM" | "GIFT";
  rewardCatalogId?: string | number;
  promotionCampaignId?: string | null;
  idempotencyKey?: string;
}) {
  try {
    const serviceResponse = await redeemPointsViaService(
      input,
      input.idempotencyKey || `redeem-${input.memberIdentifier}-${input.transactionType ?? "REDEEM"}-${input.reason}-${input.points}`
    );
    if (serviceResponse?.ok) return serviceResponse.result;
    throw new Error("Points service redeem failed.");
  } catch (error) {
    throw error;
  }
  throw new Error("Points Service redeem endpoint did not return a usable result.");
}

export async function updateMemberProfile(input: {
  memberIdentifier: string;
  fallbackEmail?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthdate?: string;
  address?: string;
  profilePhotoUrl?: string;
}) {
  const member = await findMember(input.memberIdentifier, input.fallbackEmail);
  if (!member) {
    throw new Error("Member not found in loyalty_members.");
  }

  const authRes = await supabase.auth.getUser();
  const localSession = getCurrentCustomerSession();
  if (authRes.error && !localSession?.email) throw authRes.error;

  const authEmail = authRes.data.user?.email || localSession?.email;
  if (!authEmail) {
    throw new Error("Unable to update profile: no authenticated user email found.");
  }

  const normalizedAuthEmail = authEmail.trim().toLowerCase();
  const normalizedNewEmail = input.email.trim().toLowerCase();
  const emailChanged = normalizedNewEmail !== normalizedAuthEmail;

  let persistedAuthEmail = normalizedAuthEmail;
  let pendingEmailVerification = false;

  if (emailChanged) {
    if (DEMO_SKIP_AUTH_EMAIL_UPDATE || !authRes.data.user) {
      // Demo mode:
      // update the profile table email only, and keep Supabase Auth email unchanged.
      // To restore real auth email updates, set DEMO_SKIP_AUTH_EMAIL_UPDATE to false.
      persistedAuthEmail = normalizedNewEmail;
    } else {
      const authUpdate = await supabase.auth.updateUser({ email: normalizedNewEmail });
      if (authUpdate.error) {
        throw new Error(`Unable to update auth email: ${authUpdate.error.message}`);
      }

      const authUserEmail = String(authUpdate.data.user?.email || normalizedAuthEmail).trim().toLowerCase();
      pendingEmailVerification = authUserEmail !== normalizedNewEmail;
      persistedAuthEmail = pendingEmailVerification ? normalizedAuthEmail : normalizedNewEmail;
    }
  }

  if (emailChanged) {
    clearPendingEmailAlias(normalizedNewEmail);
    clearPendingEmailAlias(normalizedAuthEmail);
  }

  const updateRes = await updateMemberProfileViaApi(String(member.member_number || input.memberIdentifier), {
    fallbackEmail: input.fallbackEmail,
    firstName: input.firstName,
    lastName: input.lastName,
    email: persistedAuthEmail,
    phone: input.phone,
    birthdate: input.birthdate || undefined,
    address: input.address ?? null,
    profilePhotoUrl: input.profilePhotoUrl ?? null,
  });
  const updatedMember = updateRes.member || {};

  return {
    success: true,
    emailChanged,
    pendingEmailVerification,
    effectiveEmail: String(updatedMember.email || persistedAuthEmail),
  };
}

export async function uploadMemberProfilePhoto(memberIdentifier: string, file: File): Promise<string> {
  const member = await findMember(memberIdentifier);
  if (!member) throw new Error("Member not found in loyalty_members.");

  const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${member.member_number || memberIdentifier}/${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("profile-photos").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type,
  });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("profile-photos").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Unable to resolve profile photo URL.");
  return data.publicUrl;
}

export async function uploadRegistrationProfilePhoto(memberIdentifier: string, file: File): Promise<string> {
  const member = await findMember(memberIdentifier);
  if (!member) throw new Error("Member not found in loyalty_members.");

  const photoUrl = await uploadMemberProfilePhoto(memberIdentifier, file);
  await updateMemberProfileViaApi(String(member.member_number || memberIdentifier), {
    fallbackEmail: String(member.email || "") || undefined,
    profilePhotoUrl: photoUrl,
  });
  return photoUrl;
}

export async function loadTierHistory(memberIdentifier: string, fallbackEmail?: string): Promise<Array<{
  id: string | number;
  old_tier?: string | null;
  new_tier?: string | null;
  changed_at?: string | null;
  reason?: string | null;
}>> {
  return loadTierHistoryViaApi(memberIdentifier, fallbackEmail);
}

export async function queueExpiryReminderNotifications() {
  const result = await runExpiryViaService();
  return Number(result?.result?.pointsExpired ?? 0);
}

export async function trackMemberLoginActivity(input?: {
  memberIdentifier?: string;
  fallbackEmail?: string;
  channel?: "web" | "mobile" | "kiosk" | "system";
  source?: string;
}) {
  const member = await findMember(input?.memberIdentifier, input?.fallbackEmail);
  if (!member) return false;

  const pk = getMemberPk(member);
  if (!pk) return false;

  const result = await recordMemberLoginActivityViaApi(String(member.member_number || input?.memberIdentifier || pk.value), {
    channel: input?.channel ?? "web",
    source: input?.source ?? "customer_portal",
  });
  return Boolean(result.recorded);
}

export async function createReengagementAction(input: {
  memberIdentifier: string;
  fallbackEmail?: string;
  riskLevel: "Low" | "Medium" | "High";
  actionType: string;
  recommendedAction: string;
  actionNotes?: string;
  status?: "planned" | "sent" | "completed" | "dismissed";
  followUpDueAt?: string;
}) {
  const response = await requestJson<{ ok: true; action: AnyRecord }>("/api/members/reengagement-actions", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.action;
}

export async function updateReengagementActionOutcome(input: {
  id: number | string;
  status?: "planned" | "sent" | "completed" | "dismissed";
  success?: boolean | null;
  successMetric?: string;
  sentAt?: string | null;
  completedAt?: string | null;
}) {
  const response = await requestJson<{ ok: true; action: AnyRecord }>(
    `/api/members/reengagement-actions/${encodeURIComponent(String(input.id))}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
  return response.action;
}

export async function loadReengagementActions() {
  const response = await requestJson<{ ok: true; actions: AnyRecord[] }>("/api/members/reengagement-actions");
  return response.actions || [];
}
