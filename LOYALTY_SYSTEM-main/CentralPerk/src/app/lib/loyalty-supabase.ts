// @ts-nocheck
import { supabase } from "../../utils/supabase/client";
import type { EarnOpportunity, MemberData, Reward, Transaction } from "../types/loyalty";
import { getCurrentCustomerSession } from "../auth/auth";
import { clearPendingEmailAlias } from "../auth/customer-auth";
import { queueMemberNotification } from "./notifications";
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
  redeemPointsViaService,
  runExpiryViaService,
  fetchTierRulesViaService,
} from "./points-service-client";
import { claimBirthdayReward, loadBirthdayRewardSettings, shouldAutoCreditBirthdayReward } from "./member-lifecycle";
import { loadMemberBadgeProgress } from "./promotions";

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

function sanitizePointsBalance(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function getTransactionNote(row: AnyRecord): string {
  return String(row.reason ?? row.description ?? "");
}

function shouldFallbackFromServiceError(error: unknown): boolean {
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
  const payloadWithTransactionId = withTransactionId(payload);
  const attempts: AnyRecord[] = [];
  const seen = new Set<string>();

  const queueAttempt = (value: AnyRecord) => {
    const key = JSON.stringify(Object.keys(value).sort().map((item) => [item, value[item]]));
    if (seen.has(key)) return;
    seen.add(key);
    attempts.push(value);
  };

  queueAttempt({ ...payloadWithTransactionId });

  if ("reason" in payloadWithTransactionId) {
    const { reason, ...rest } = payloadWithTransactionId;
    queueAttempt({ ...rest, description: reason });
    queueAttempt(rest);
  } else if ("description" in payloadWithTransactionId) {
    const { description, ...rest } = payloadWithTransactionId;
    queueAttempt({ ...rest, reason: description });
    queueAttempt(rest);
  }

  let lastError: unknown = null;

  for (const attempt of attempts) {
    const result = await supabase.from("loyalty_transactions").insert(attempt);
    if (!result.error) return;

    const reasonMissing = isMissingColumnError(result.error, "loyalty_transactions", "reason");
    const descriptionMissing = isMissingColumnError(result.error, "loyalty_transactions", "description");
    if (!reasonMissing && !descriptionMissing) {
      throw result.error;
    }

    lastError = result.error;
  }

  if (lastError) throw lastError;
  throw new Error("Unable to insert loyalty transaction.");
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
    description: "Get the CentralPerk mobile app on your phone",
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
  const existingNotification = await supabase
    .from("notification_outbox")
    .select("id")
    .eq("member_id", Number(memberPk.value))
    .eq("channel", "email")
    .eq("subject", "Welcome to GREENOVATE Rewards")
    .limit(1)
    .maybeSingle();
  if (existingNotification.error) throw existingNotification.error;

  if (!existingNotification.data?.id) {
    await queueMemberNotification({
      memberId: String(member.member_number || memberPk.value),
      channel: "email",
      subject: "Welcome to GREENOVATE Rewards",
      message: `Hi ${String(member.first_name || "Member")}, welcome to GREENOVATE Rewards! Your Member ID is ${String(member.member_number || "Pending ID")}. Program basics: earn points on purchases, redeem rewards in-app, and monitor expiry alerts in your dashboard.`,
      isTransactional: true,
    });
  }
}

async function ensureMemberTransactionNotification(input: {
  member: AnyRecord;
  memberPk: { key: string; value: any };
  subject: string;
  message: string;
}) {
  const existingNotification = await supabase
    .from("notification_outbox")
    .select("id")
    .eq("member_id", Number(input.memberPk.value))
    .eq("channel", "push")
    .eq("subject", input.subject)
    .eq("message", input.message)
    .limit(1)
    .maybeSingle();
  if (existingNotification.error) throw existingNotification.error;

  if (!existingNotification.data?.id) {
    await queueMemberNotification({
      memberId: String(input.member.member_number || input.memberPk.value),
      channel: "push",
      subject: input.subject,
      message: input.message,
      isTransactional: true,
    });
  }
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
  const existingWelcomeRes = await supabase
    .from("loyalty_transactions")
    .select("*")
    .eq("member_id", memberPk.value)
    .limit(200);
  if (existingWelcomeRes.error) throw existingWelcomeRes.error;
  const existingWelcome = ((existingWelcomeRes.data || []) as AnyRecord[]).find(
    (row) => getTransactionNote(row) === WELCOME_PACKAGE_REASON
  );
  if (existingWelcome) {
    await ensureWelcomePackageNotification(member, memberPk);
    return { granted: false, pointsAdded: 0 };
  }

  const rules = await fetchTierRules();

  await insertLoyaltyTransaction({
    member_id: memberPk.value,
    transaction_type: "EARN",
    points: WELCOME_PACKAGE_POINTS,
    reason: WELCOME_PACKAGE_REASON,
  });

  const refreshedMemberRes = await supabase
    .from("loyalty_members")
    .select("points_balance,tier")
    .eq(memberPk.key, memberPk.value)
    .limit(1)
    .maybeSingle();
  if (refreshedMemberRes.error) throw refreshedMemberRes.error;
  const newBalance = sanitizePointsBalance(refreshedMemberRes.data?.points_balance ?? member.points_balance ?? 0);
  const newTier = normalizeTierLabel(
    String(refreshedMemberRes.data?.tier ?? resolveTier(newBalance, rules))
  ) as SupportedTier;

  await ensureWelcomePackageNotification(member, memberPk);

  return { granted: true, pointsAdded: WELCOME_PACKAGE_POINTS, newBalance, newTier };
}

async function readMemberBalanceSnapshot(
  memberPk: { key: string; value: any },
  fallbackBalance = 0
): Promise<{ newBalance: number; newTier: SupportedTier }> {
  const rules = await fetchTierRules();
  const refreshedMemberRes = await supabase
    .from("loyalty_members")
    .select("points_balance,tier")
    .eq(memberPk.key, memberPk.value)
    .limit(1)
    .maybeSingle();
  if (refreshedMemberRes.error) throw refreshedMemberRes.error;

  const newBalance = sanitizePointsBalance(refreshedMemberRes.data?.points_balance ?? fallbackBalance);
  const newTier = normalizeTierLabel(
    String(refreshedMemberRes.data?.tier ?? resolveTier(newBalance, rules))
  ) as SupportedTier;

  return { newBalance, newTier };
}

async function processMemberExpiredPoints(memberPk: { key: string; value: any }) {
  const txQuery = await supabase
    .from("loyalty_transactions")
    .select("points,transaction_type,expiry_date")
    .eq("member_id", memberPk.value)
    .limit(500);

  if (txQuery.error) throw txQuery.error;
  const rows = (txQuery.data || []) as AnyRecord[];
  if (rows.length === 0) return;

  const now = Date.now();
  const expiredEarned = rows
    .filter((row) => Number(row.points || 0) > 0 && row.expiry_date && new Date(row.expiry_date).getTime() < now)
    .reduce((sum, row) => sum + Math.abs(Number(row.points || 0)), 0);
  const alreadyDeducted = rows
    .filter((row) => String(row.transaction_type || "").toUpperCase() === "EXPIRY_DEDUCTION")
    .reduce((sum, row) => sum + Math.abs(Number(row.points || 0)), 0);
  const totalExpired = Math.max(0, expiredEarned - alreadyDeducted);
  if (totalExpired === 0) return;

  const { data: memberNow, error: memberErr } = await supabase
    .from("loyalty_members")
    .select("points_balance")
    .eq(memberPk.key, memberPk.value)
    .limit(1)
    .maybeSingle();
  if (memberErr) throw memberErr;

  await insertLoyaltyTransaction({
    member_id: memberPk.value,
    transaction_type: "EXPIRY_DEDUCTION",
    points: -Math.abs(totalExpired),
    reason: "Points Expired",
  });
  await readMemberBalanceSnapshot(memberPk, memberNow?.points_balance ?? 0);
}

export async function processAllMemberExpiredPoints() {
  const serviceResponse = await runExpiryViaService().catch(() => null);
  if (serviceResponse?.ok) return serviceResponse.result;
  /* fallback to legacy flow */
  const { data, error } = await supabase.from("loyalty_members").select("id,member_id");
  if (error) throw error;
  const members = (data || []) as AnyRecord[];

  for (const member of members) {
    const pk = getMemberPk(member);
    if (!pk) continue;
    await processMemberExpiredPoints(pk);
  }
}

export async function fetchTierRules(): Promise<TierRule[]> {
  const response = await fetchTierRulesViaService().catch(() => null);
  if (response?.ok && Array.isArray(response.tiers)) {
    return normalizeTierRules(response.tiers as TierRule[]);
  }
  return DEFAULT_TIER_RULES;
}

export async function saveTierRules(rules: TierRule[]): Promise<void> {
  // Delegate writes to points engine; fall back to legacy table if service unavailable.
  await supabase
    .from("points_tiers")
    .upsert(
      normalizeTierRules(rules).map((rule) => ({
        tier_label: normalizeTierLabel(rule.tier_label),
        min_points: Math.max(0, Math.floor(Number(rule.min_points) || 0)),
        is_active: true,
      })),
      { onConflict: "tier_label" }
    );
}


export async function fetchActiveEarningRules(): Promise<EarningRule[]> {
  const { data, error } = await supabase
    .from("earning_rules")
    .select("tier_label,peso_per_point,multiplier,is_active,effective_at")
    .eq("is_active", true)
    .order("effective_at", { ascending: false });

  if (error || !data || data.length === 0) {
    return [
      { tier_label: "Bronze", peso_per_point: 10, multiplier: 1, is_active: true },
      { tier_label: "Silver", peso_per_point: 10, multiplier: 1.25, is_active: true },
      { tier_label: "Gold", peso_per_point: 10, multiplier: 1.5, is_active: true },
    ];
  }

  const latestByTier = new Map<SupportedTier, EarningRule>();
  for (const row of data as AnyRecord[]) {
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
  for (const rawRule of rules) {
    const tier = normalizeTierLabel(rawRule.tier_label) as SupportedTier;
    const pesoPerPoint = Math.max(0.01, Number(rawRule.peso_per_point) || 10);
    const multiplier = Math.max(0.01, Number(rawRule.multiplier) || 1);

    const { error: deactivateError } = await supabase
      .from("earning_rules")
      .update({ is_active: false })
      .eq("tier_label", tier)
      .eq("is_active", true);
    if (deactivateError) throw deactivateError;

    const { error: insertError } = await supabase.from("earning_rules").insert({
      tier_label: tier,
      peso_per_point: pesoPerPoint,
      multiplier,
      is_active: true,
      effective_at: new Date().toISOString(),
    });
    if (insertError) throw insertError;
  }

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
    const { data, error } = await supabase
      .from("earning_rules")
      .select("tier_label,peso_per_point,multiplier,is_active")
      .eq("tier_label", tier)
      .eq("is_active", true)
      .order("effective_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

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
  const { data, error } = await supabase.rpc("loyalty_resolve_purchase_campaigns", {
    p_member_id: input.memberId,
    p_purchase_amount: input.purchaseAmount,
    p_base_points: input.basePoints,
    p_member_tier: input.memberTier,
    p_product_scope: input.productScope?.trim() || null,
  });

  if (error) {
    if (isMissingRelationError(error, "promotion_campaigns")) return [];
    throw error;
  }

  return ((data || []) as AnyRecord[]).map((row) => ({
    campaign_id: String(row.campaign_id ?? ""),
    campaign_name: String(row.campaign_name ?? ""),
    campaign_type: String(row.campaign_type ?? "bonus_points") as PurchaseCampaignBonus["campaign_type"],
    awarded_points: Number(row.awarded_points ?? 0),
    applied_multiplier: Number(row.applied_multiplier ?? 1),
    minimum_purchase_amount: Number(row.minimum_purchase_amount ?? 0),
  }));
}

async function refreshMemberBadges(memberId: number) {
  const { error } = await supabase.rpc("loyalty_refresh_member_badges", {
    p_member_id: memberId,
  });

  if (error && !isMissingRelationError(error, "badge_definitions")) {
    throw error;
  }
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
  const { data, error } = await supabase
    .from("promotion_campaigns")
    .select("id,campaign_name,flash_sale_quantity_limit,flash_sale_claimed_count,starts_at,ends_at,countdown_label,banner_title,banner_message")
    .eq("campaign_type", "flash_sale")
    .eq("reward_id", Number(rewardCatalogId))
    .in("status", ["scheduled", "active"])
    .order("starts_at", { ascending: true })
    .limit(5);

  if (error) {
    if (isMissingRelationError(error, "promotion_campaigns")) return null;
    throw error;
  }

  const now = Date.now();
  const rows = (data || []) as AnyRecord[];
  const active = rows.find((row) => {
    const startsAt = new Date(String(row.starts_at ?? "")).getTime();
    const endsAt = new Date(String(row.ends_at ?? "")).getTime();
    return startsAt <= now && endsAt >= now;
  });

  return active || null;
}

export async function loadRewardsCatalog(): Promise<Reward[]> {
  let rewardRows: AnyRecord[] = [];
  const rewardsWithPartner = await supabase
    .from("rewards_catalog")
    .select("*, reward_partners(id,partner_code,partner_name,logo_url,conversion_rate,is_active)")
    .eq("is_active", true)
    .order("points_cost", { ascending: true });

  if (!rewardsWithPartner.error && rewardsWithPartner.data) {
    rewardRows = rewardsWithPartner.data as AnyRecord[];
  } else {
    const fallback = await supabase
      .from("rewards_catalog")
      .select("*")
      .eq("is_active", true)
      .order("points_cost", { ascending: true });

    if (fallback.error || !fallback.data) return [];
    rewardRows = fallback.data as AnyRecord[];
  }

  const flashSalesRes = await supabase
    .from("promotion_campaigns")
    .select("id,reward_id,flash_sale_quantity_limit,flash_sale_claimed_count,starts_at,ends_at,countdown_label,banner_title,banner_message,status")
    .eq("campaign_type", "flash_sale")
    .neq("status", "archived");

  const flashSaleByReward = new Map<string, AnyRecord>();
  if (!flashSalesRes.error) {
    const now = Date.now();
    for (const row of (flashSalesRes.data || []) as AnyRecord[]) {
      if (row.reward_id === undefined || row.reward_id === null) continue;

      const rewardId = String(row.reward_id);
      const startsAt = new Date(String(row.starts_at ?? "")).getTime();
      const endsAt = new Date(String(row.ends_at ?? "")).getTime();
      const nextRowPriority = startsAt <= now && endsAt >= now ? 2 : startsAt > now ? 1 : 0;
      const existing = flashSaleByReward.get(rewardId);

      if (!existing) {
        flashSaleByReward.set(rewardId, row);
        continue;
      }

      const existingStartsAt = new Date(String(existing.starts_at ?? "")).getTime();
      const existingEndsAt = new Date(String(existing.ends_at ?? "")).getTime();
      const existingPriority =
        existingStartsAt <= now && existingEndsAt >= now ? 2 : existingStartsAt > now ? 1 : 0;

      const shouldReplace =
        nextRowPriority > existingPriority ||
        (nextRowPriority === existingPriority && endsAt > existingEndsAt);

      if (shouldReplace) {
        flashSaleByReward.set(rewardId, row);
      }
    }
  }

  return rewardRows.map((row) => {
    const partner = row.reward_partners as AnyRecord | null;
    const rewardCatalogId = row.id ?? null;
    const flashSale = rewardCatalogId ? flashSaleByReward.get(String(rewardCatalogId)) : null;

    return {
      id: String(row.reward_id ?? row.id ?? ""),
      rewardCatalogId: rewardCatalogId ? String(rewardCatalogId) : undefined,
      name: String(row.name ?? "Reward"),
      description: String(row.description ?? ""),
      pointsCost: Number(row.points_cost ?? 0),
      category: String(row.category ?? "voucher") as Reward["category"],
      imageUrl: row.image_url ? String(row.image_url) : undefined,
      available: Boolean(row.is_active ?? true),
      expiryDate: row.expiry_date ? String(row.expiry_date) : undefined,
      partnerId: partner?.id ? String(partner.id) : row.partner_id ? String(row.partner_id) : null,
      partnerName: partner?.partner_name ? String(partner.partner_name) : null,
      partnerCode: partner?.partner_code ? String(partner.partner_code) : null,
      partnerLogoUrl: partner?.logo_url ? String(partner.logo_url) : null,
      partnerConversionRate:
        partner?.conversion_rate !== undefined && partner?.conversion_rate !== null
          ? Number(partner.conversion_rate)
          : null,
      cashValue: row.cash_value !== undefined && row.cash_value !== null ? Number(row.cash_value) : null,
      activeFlashSaleId: flashSale?.id ? String(flashSale.id) : null,
      flashSaleStartsAt: flashSale?.starts_at ? String(flashSale.starts_at) : null,
      flashSaleEndsAt: flashSale?.ends_at ? String(flashSale.ends_at) : null,
      flashSaleQuantityLimit:
        flashSale?.flash_sale_quantity_limit !== undefined && flashSale?.flash_sale_quantity_limit !== null
          ? Number(flashSale.flash_sale_quantity_limit)
          : null,
      flashSaleClaimedCount: Number(flashSale?.flash_sale_claimed_count ?? 0),
      flashSaleBanner: flashSale?.banner_title ? String(flashSale.banner_title) : flashSale?.banner_message ? String(flashSale.banner_message) : null,
      flashSaleCountdownLabel: flashSale?.countdown_label ? String(flashSale.countdown_label) : null,
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
    const { data, error } = await supabase
      .from("earn_tasks")
      .select("*")
      .eq("is_active", true)
      .order("points", { ascending: false });

    const resolved = error || !data
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
  let lookup: { data: AnyRecord | null; error: any } = { data: null, error: null };
  const normalizedFallbackEmail = fallbackEmail?.trim();

  if (memberIdentifier) {
    lookup = await supabase
      .from("loyalty_members")
      .select("*")
      .eq("member_number", memberIdentifier)
      .limit(1)
      .maybeSingle();
  }

  if (!lookup.data && normalizedFallbackEmail) {
    lookup = await supabase
      .from("loyalty_members")
      .select("*")
      .ilike("email", normalizedFallbackEmail)
      .limit(1)
      .maybeSingle();
  }

  if (!lookup.data) {
    const localSession = getCurrentCustomerSession();
    const localEmail = localSession?.email?.trim();
    if (localEmail && localEmail.toLowerCase() !== normalizedFallbackEmail?.toLowerCase()) {
      lookup = await supabase
        .from("loyalty_members")
        .select("*")
        .ilike("email", localEmail)
        .limit(1)
        .maybeSingle();
    }
  }

  if (!lookup.data) {
    const authRes = await supabase.auth.getUser();
    const authEmail = authRes.data.user?.email?.trim();
    if (authEmail && authEmail.toLowerCase() !== normalizedFallbackEmail?.toLowerCase()) {
      lookup = await supabase
        .from("loyalty_members")
        .select("*")
        .ilike("email", authEmail)
        .limit(1)
        .maybeSingle();
    }
  }

  if (lookup.error) throw lookup.error;
  return lookup.data as AnyRecord | null;
}

export async function loadMemberSnapshot(currentUser: MemberData): Promise<Partial<MemberData> | null> {
  const localSession = getCurrentCustomerSession();
  const authRes = await supabase.auth.getUser();
  const authEmail = String(authRes.data.user?.email || localSession?.email || "").trim().toLowerCase();
  const authUser = authRes.data.user;
  const memberLookupId = localSession?.memberId || currentUser.memberId;
  const memberLookupEmail = authEmail || localSession?.email || currentUser.email;
  const member = await findMember(memberLookupId, memberLookupEmail);
  if (!member) {
    const authFullName =
      String(authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || "").trim() || currentUser.fullName;

    return {
      fullName: authFullName || localSession?.fullName || "Member",
      email: String(authUser?.email || localSession?.email || currentUser.email || ""),
    };
  }

  const rules = await fetchTierRules();
  const pk = getMemberPk(member);
  if (!pk) return null;

  await grantWelcomePackageForMember(member, pk);
  await processMemberExpiredPoints(pk);
  if (
    shouldAutoCreditBirthdayReward(
      {
        birthdate: String(member.birthdate || currentUser.birthdate || ""),
      },
      loadBirthdayRewardSettings()
    )
  ) {
    await claimBirthdayReward(String(member.member_number || currentUser.memberId), String(member.email || currentUser.email));
  }

  const refreshedMemberRes = await supabase
    .from("loyalty_members")
    .select("*")
    .eq(pk.key, pk.value)
    .limit(1)
    .maybeSingle();
  const refreshedMember = (refreshedMemberRes.data as AnyRecord | null) ?? member;
  const currentBalance = sanitizePointsBalance(refreshedMember.points_balance ?? currentUser.points ?? 0);

  const txRes = await supabase
    .from("loyalty_transactions")
    .select("*")
    .eq("member_id", pk.value)
    .order("transaction_date", { ascending: false })
    .limit(200);

  const rawTx = (txRes.data || []) as AnyRecord[];
  const completedTaskIds = new Set(
    rawTx
      .map((tx) => String(getTransactionNote(tx) || "").match(/Task completed \(([^)]+)\)/i)?.[1] ?? null)
      .filter((taskId): taskId is string => Boolean(taskId))
  );

  let runningBalance = currentBalance;
  const transactions: Transaction[] = rawTx.map((tx, index) => {
    const signedPoints = Number(tx.points ?? 0);
    const mappedType = mapTxType(String(tx.transaction_type ?? ""));
    const mapped: Transaction = {
      id: String(tx.transaction_id ?? tx.id ?? `${index}`),
      date: getTxDateValue(tx),
      description: String(getTransactionNote(tx) || tx.transaction_type || "Transaction"),
      type: mappedType,
      points: Math.abs(signedPoints),
      balance: runningBalance,
      category: getTransactionNote(tx) ? "System" : "Purchase",
      receiptId: tx.receipt_id ? String(tx.receipt_id) : undefined,
    };
    if (mappedType !== "pending") {
      runningBalance -= signedPoints;
    }
    return mapped;
  });

  const nowMonth = monthKey(new Date());
  const isCurrentMonthTx = (tx: AnyRecord) => monthKey(getTxDateValue(tx)) === nowMonth;
  const pendingPoints = rawTx
    .filter((tx) => mapTxType(String(tx.transaction_type ?? "")) === "pending" && Number(tx.points || 0) > 0)
    .reduce((sum, tx) => sum + Number(tx.points || 0), 0);

  const earnedThisMonth = rawTx
    .filter(
      (tx) =>
        mapTxType(String(tx.transaction_type ?? "")) === "earned" &&
        Number(tx.points || 0) > 0 &&
        isCurrentMonthTx(tx)
    )
    .reduce((sum, tx) => sum + Number(tx.points || 0), 0);

  const redeemedThisMonth = rawTx
    .filter(
      (tx) =>
        mapTxType(String(tx.transaction_type ?? "")) === "redeemed" &&
        Number(tx.points || 0) !== 0 &&
        isCurrentMonthTx(tx)
    )
    .reduce((sum, tx) => sum + Math.abs(Number(tx.points || 0)), 0);

  const rawLifetimePoints = rawTx
    .filter(
      (tx) => mapTxType(String(tx.transaction_type ?? "")) === "earned" && Number(tx.points || 0) > 0
    )
    .reduce((sum, tx) => sum + Number(tx.points || 0), 0);
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
    return Number(tx.points || 0) > 0 && days >= 0 && days <= 30;
  });

  const expiringPoints = upcomingExpiring.reduce((sum, tx) => sum + Number(tx.points || 0), 0);
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
  await processMemberExpiredPoints(pk);

  const memberRes = await supabase
    .from("loyalty_members")
    .select("*")
    .eq(pk.key, pk.value)
    .limit(1)
    .maybeSingle();
  if (memberRes.error) throw memberRes.error;
  const refreshed = (memberRes.data || member) as AnyRecord;

  const txRes = await supabase
    .from("loyalty_transactions")
    .select("*")
    .eq("member_id", pk.value)
    .order("transaction_date", { ascending: false })
    .limit(500);
  if (txRes.error) throw txRes.error;
  const rawTx = (txRes.data || []) as AnyRecord[];

  return {
    balance: {
      member_id: String(refreshed.member_number || memberIdentifier),
      points_balance: Number(refreshed.points_balance || 0),
      tier: resolveTier(Number(refreshed.points_balance || 0), rules),
    },
    history: rawTx.map((tx) => ({
      type: String(tx.transaction_type || ""),
      points: Number(tx.points || 0),
      date: getTxDateValue(tx),
      expiry_date: tx.expiry_date ? String(tx.expiry_date) : null,
      reason: getTransactionNote(tx),
    })),
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
    if (!shouldFallbackFromServiceError(error)) throw error;
  }
  /* legacy in-monolith logic retained for reference only */
  const member = await findMember(input.memberIdentifier, input.fallbackEmail);
  if (!member) throw new Error("Member not found in loyalty_members.");
  const pk = getMemberPk(member);
  if (!pk) throw new Error("Member primary key is missing.");
  const previousBadgeProgress = await loadMemberBadgeProgress(
    String(member.member_number || input.memberIdentifier),
    String(member.email || input.fallbackEmail || "")
  ).catch(() => []);
  const previousEarnedBadgeIds = new Set(
    previousBadgeProgress.filter((badge) => badge.isEarned).map((badge) => String(badge.badgeId))
  );

  let pointsToAdd = Math.max(0, Math.floor(input.points));
  let bonusPointsAdded = 0;
  let appliedCampaigns: PurchaseCampaignBonus[] = [];
  const memberTier = normalizeTierLabel(String(member.tier || "Bronze")) as SupportedTier;
  if (input.transactionType === "PURCHASE") {
    const purchaseAmount = Number(input.amountSpent || 0);
    pointsToAdd = await calculateDynamicPurchasePoints({ amountSpent: purchaseAmount, tier: memberTier });
    appliedCampaigns = await loadPurchaseCampaignBonuses({
      memberId: Number(pk.value),
      purchaseAmount,
      basePoints: pointsToAdd,
      memberTier,
      productScope: input.productCategory || input.productCode,
    });
  }

  const txPayload: AnyRecord = {
    member_id: pk.value,
    transaction_type: input.transactionType,
    points: pointsToAdd,
    reason: input.reason,
  };
  if (input.idempotencyKey) txPayload.receipt_id = input.idempotencyKey;
  if (input.amountSpent !== undefined) txPayload.amount_spent = input.amountSpent;
  if (input.productCode) txPayload.product_code = input.productCode.trim();
  if (input.productCategory) txPayload.product_category = input.productCategory.trim();
  if (input.transactionType === "PURCHASE") {
    txPayload.expiry_date = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  }

  await insertLoyaltyTransaction(txPayload);
  if (input.transactionType === "PURCHASE") {
    for (const campaign of appliedCampaigns.filter((row) => row.awarded_points > 0)) {
      bonusPointsAdded += campaign.awarded_points;
      await insertLoyaltyTransaction({
        member_id: pk.value,
        transaction_type: "MANUAL_AWARD",
        points: campaign.awarded_points,
        amount_spent: input.amountSpent ?? 0,
        reason: `${campaign.campaign_name} bonus`,
        promotion_campaign_id: campaign.campaign_id,
        product_code: input.productCode?.trim() || null,
        product_category: input.productCategory?.trim() || null,
        receipt_id: input.idempotencyKey ? `${input.idempotencyKey}:bonus:${campaign.campaign_id}` : null,
        expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }
  }

  await refreshMemberBadges(Number(pk.value));
  await queueNewBadgeNotifications({ member, memberPk: pk, previousEarnedBadgeIds });
  const { newBalance, newTier } = await readMemberBalanceSnapshot(pk, member.points_balance ?? 0);

  const displayName = String(member.first_name || "Member");
  if (input.transactionType === "PURCHASE") {
    const totalAwarded = pointsToAdd + bonusPointsAdded;
    const purchaseLabel = input.amountSpent !== undefined ? ` from your purchase of PHP ${Number(input.amountSpent).toFixed(2)}` : "";
    const bonusLabel = bonusPointsAdded > 0 ? ` including ${bonusPointsAdded} campaign bonus points` : "";
    await ensureMemberTransactionNotification({
      member,
      memberPk: pk,
      subject: "Points Earned",
      message: `Hi ${displayName}, you earned ${totalAwarded} points${purchaseLabel}${bonusLabel}.`,
    });
    await queueCampaignBonusNotification({
      member,
      memberPk: pk,
      bonusPointsAdded,
      appliedCampaigns,
    });
  } else {
    await ensureMemberTransactionNotification({
      member,
      memberPk: pk,
      subject: "Points Update",
      message: `Hi ${displayName}, ${pointsToAdd > 0 ? `you earned ${pointsToAdd}` : `your balance changed by ${pointsToAdd}`} points. Reason: ${input.reason}.`,
    });
  }

  return {
    newBalance,
    newTier,
    pointsAdded: pointsToAdd + bonusPointsAdded,
    bonusPointsAdded,
    appliedCampaigns,
  };
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
    if (!shouldFallbackFromServiceError(error)) throw error;
  }
  /* legacy logic retained below */
  const member = await findMember(input.memberIdentifier, input.fallbackEmail);
  if (!member) throw new Error("Member not found in loyalty_members.");
  const pk = getMemberPk(member);
  if (!pk) throw new Error("Member primary key is missing.");
  const previousBadgeProgress = await loadMemberBadgeProgress(
    String(member.member_number || input.memberIdentifier),
    String(member.email || input.fallbackEmail || "")
  ).catch(() => []);
  const previousEarnedBadgeIds = new Set(
    previousBadgeProgress.filter((badge) => badge.isEarned).map((badge) => String(badge.badgeId))
  );

  const currentBalance = sanitizePointsBalance(member.points_balance ?? 0);
  const pointsToDeduct = Math.max(0, Math.floor(input.points));
  if (pointsToDeduct > currentBalance) throw new Error("Not enough points.");

  let flashSaleCampaignId = input.promotionCampaignId || null;
  if (!flashSaleCampaignId && input.rewardCatalogId !== undefined) {
    const activeFlashSale = await loadActiveFlashSaleCampaignForReward(input.rewardCatalogId);
    flashSaleCampaignId = activeFlashSale?.id ? String(activeFlashSale.id) : null;
  }

  if (flashSaleCampaignId) {
    const flashSaleClaim = await supabase.rpc("loyalty_claim_flash_sale_campaign", {
      p_campaign_id: flashSaleCampaignId,
    });
    if (flashSaleClaim.error) throw flashSaleClaim.error;
  }

  await insertLoyaltyTransaction({
    member_id: pk.value,
    transaction_type: input.transactionType ?? "REDEEM",
    points: -Math.abs(pointsToDeduct),
    reason: input.reason,
    receipt_id: input.idempotencyKey ?? null,
    reward_catalog_id:
      input.rewardCatalogId === undefined || input.rewardCatalogId === null ? null : Number(input.rewardCatalogId),
    promotion_campaign_id: flashSaleCampaignId,
  });

  const fifoConsume = await supabase.rpc("loyalty_consume_points_fifo", {
    p_member_id: pk.value,
    p_points_to_consume: pointsToDeduct,
  });
  if (fifoConsume.error) throw fifoConsume.error;
  await refreshMemberBadges(Number(pk.value));
  await queueNewBadgeNotifications({ member, memberPk: pk, previousEarnedBadgeIds });
  const { newBalance, newTier } = await readMemberBalanceSnapshot(pk, currentBalance);

  await ensureMemberTransactionNotification({
    member,
    memberPk: pk,
    subject: input.transactionType === "GIFT" ? "Points Gifted" : "Reward Redeemed",
    message:
      input.transactionType === "GIFT"
        ? `Hi ${String(member.first_name || "Member")}, you gifted ${pointsToDeduct} points. Reason: ${input.reason}.`
        : `Hi ${String(member.first_name || "Member")}, you redeemed ${pointsToDeduct} points. Reason: ${input.reason}.`,
  });

  if (flashSaleCampaignId && input.transactionType !== "GIFT") {
    await ensureMemberTransactionNotification({
      member,
      memberPk: pk,
      subject: "Flash Sale Redemption Confirmed",
      message: `Hi ${String(member.first_name || "Member")}, your flash sale redemption is confirmed. Reward: ${input.reason}.`,
    });
  }

  return { newBalance, newTier, pointsDeducted: pointsToDeduct };
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

  const updateRes = await supabase
    .from("loyalty_members")
    .update({
      first_name: input.firstName,
      last_name: input.lastName,
      email: persistedAuthEmail,
      phone: input.phone,
      birthdate: input.birthdate || null,
      address: input.address ?? null,
      profile_photo_url: input.profilePhotoUrl ?? null,
    })
    .eq("id", Number(member.id))
    .select("id,email");
  if (updateRes.error) throw updateRes.error;
  if (!updateRes.data?.length) throw new Error("Member not found in loyalty_members.");

  return {
    success: true,
    emailChanged,
    pendingEmailVerification,
    effectiveEmail: String(updateRes.data[0].email || persistedAuthEmail),
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
  const { error } = await supabase
    .from("loyalty_members")
    .update({ profile_photo_url: photoUrl })
    .eq("id", Number(member.id ?? member.member_id));

  if (error) throw error;
  return photoUrl;
}

export async function loadTierHistory(memberIdentifier: string, fallbackEmail?: string) {
  const member = await findMember(memberIdentifier, fallbackEmail);
  if (!member) throw new Error("Member not found in loyalty_members.");
  const memberId = Number(member.id ?? member.member_id);

  const { data, error } = await supabase
    .from("tier_history")
    .select("id,old_tier,new_tier,changed_at,reason")
    .eq("member_id", memberId)
    .order("changed_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data || []) as AnyRecord[];
}

export async function queueExpiryReminderNotifications() {
  const { data, error } = await supabase.rpc("loyalty_queue_expiry_warning_notifications");
  if (error) throw error;
  return Number(data || 0);
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

  const result = await supabase.from("member_login_activity").insert({
    member_id: pk.value,
    login_at: new Date().toISOString(),
    channel: input?.channel ?? "web",
    source: input?.source ?? "customer_portal",
  });

  if (result.error) {
    if (isMissingRelationError(result.error, "member_login_activity")) return false;
    throw result.error;
  }

  return true;
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
  const member = await findMember(input.memberIdentifier, input.fallbackEmail);
  if (!member) throw new Error("Member not found in loyalty_members.");

  const pk = getMemberPk(member);
  if (!pk) throw new Error("Member primary key is missing.");

  const authRes = await supabase.auth.getUser();
  if (authRes.error) throw authRes.error;

  const { data, error } = await supabase
    .from("member_reengagement_actions")
    .insert({
      member_id: pk.value,
      initiated_by: authRes.data.user?.id ?? null,
      risk_level: input.riskLevel,
      action_type: input.actionType,
      recommended_action: input.recommendedAction,
      action_notes: input.actionNotes ?? null,
      status: input.status ?? "planned",
      follow_up_due_at: input.followUpDueAt ?? null,
      sent_at: input.status === "sent" ? new Date().toISOString() : null,
      completed_at: input.status === "completed" ? new Date().toISOString() : null,
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingRelationError(error, "member_reengagement_actions")) {
      throw new Error("Run the updated Supabase SQL first to enable re-engagement tracking.");
    }
    throw error;
  }

  return data as AnyRecord;
}

export async function updateReengagementActionOutcome(input: {
  id: number | string;
  status?: "planned" | "sent" | "completed" | "dismissed";
  success?: boolean | null;
  successMetric?: string;
  sentAt?: string | null;
  completedAt?: string | null;
}) {
  const patch: AnyRecord = {
    success: input.success ?? null,
    success_metric: input.successMetric ?? null,
  };

  if (input.status) patch.status = input.status;
  if (input.sentAt !== undefined) patch.sent_at = input.sentAt;
  if (input.completedAt !== undefined) patch.completed_at = input.completedAt;
  if (input.status === "sent" && input.sentAt === undefined) patch.sent_at = new Date().toISOString();
  if (input.status === "completed" && input.completedAt === undefined) patch.completed_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("member_reengagement_actions")
    .update(patch)
    .eq("id", input.id)
    .select("*")
    .single();

  if (error) {
    if (isMissingRelationError(error, "member_reengagement_actions")) {
      throw new Error("Run the updated Supabase SQL first to enable re-engagement tracking.");
    }
    throw error;
  }

  return data as AnyRecord;
}

export async function loadReengagementActions() {
  const { data, error } = await supabase
    .from("member_reengagement_actions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    if (isMissingRelationError(error, "member_reengagement_actions")) return [];
    throw error;
  }

  return (data || []) as AnyRecord[];
}
