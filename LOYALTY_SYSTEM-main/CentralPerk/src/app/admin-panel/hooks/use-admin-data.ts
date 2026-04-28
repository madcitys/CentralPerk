import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../utils/supabase/client";
import { requestJson } from "../../lib/api";
import type {
  AdminMetrics,
  LoyaltyTransaction,
  MemberLoginActivity,
  Member,
  MemberActivityRow,
  MemberGrowthPoint,
  PointsLot,
  RewardPopularityRow,
  RewardCatalogRow,
  ReengagementAction,
  SeriesPoint,
  TierDistribution,
  TierMovementPoint,
} from "../types";
import {
  fetchActiveEarningRules,
  fetchTierRules,
  processAllMemberExpiredPoints,
  type EarningRule,
} from "../../lib/loyalty-supabase";
import { DEFAULT_TIER_RULES, resolveTier, type TierRule } from "../../lib/loyalty-engine";
import { buildAdvancedAnalyticsDatasets } from "../lib/advanced-insights";

const EMPTY_ADMIN_INSIGHTS = buildAdvancedAnalyticsDatasets({
  members: [],
  transactions: [],
  pointsLots: [],
  rewardsCatalog: [],
  loginActivity: [],
  reengagementActions: [],
  tierRules: [],
  redemptionValuePerPoint: 0.01,
});
const ADMIN_CACHE_TTL_MS = 30_000;
const EXPIRY_PROCESS_INTERVAL_MS = 5 * 60_000;
const MEMBER_LIMIT = 2000;
const TRANSACTION_LIMIT = 5000;
const SUPPORTING_ROW_LIMIT = 1000;
const ACTIVITY_ROW_LIMIT = 2000;
const DEFAULT_EARNING_RULES: EarningRule[] = [
  { tier_label: "Bronze", peso_per_point: 10, multiplier: 1, is_active: true },
  { tier_label: "Silver", peso_per_point: 10, multiplier: 1.25, is_active: true },
  { tier_label: "Gold", peso_per_point: 10, multiplier: 1.5, is_active: true },
];

type TierHistoryRow = {
  old_tier?: string | null;
  new_tier?: string | null;
  changed_at: string;
};

type MemberSegmentRow = {
  member_id: string | number;
  member_number: string;
  auto_segment: string | null;
  manual_segment: string | null;
  effective_segment: string | null;
  last_activity_at: string | null;
};

type AdminDataSnapshot = {
  members: Member[];
  redemptions: LoyaltyTransaction[];
  transactions: LoyaltyTransaction[];
  tierHistory: TierHistoryRow[];
  pointsLots: PointsLot[];
  rewardsCatalog: RewardCatalogRow[];
  loginActivity: MemberLoginActivity[];
  reengagementActions: ReengagementAction[];
  tierRules: TierRule[];
  earningRules: EarningRule[];
  redemptionValuePerPoint: number;
};

type LocalRuntimePointTransaction = {
  id: string;
  type: string;
  points: number;
  reason: string;
  date: string;
  expiry_date: string | null;
  reference: string | null;
};

type LocalRuntimePointMember = {
  memberId: string;
  email: string | null;
  pointsBalance: number;
  tier: string;
  history: LocalRuntimePointTransaction[];
};

type AdminDataScope = "all" | "dashboard" | "members" | "activity" | "rewards" | "engagement" | "analytics";

type AdminDataRequirements = {
  memberSegments: boolean;
  tierHistory: boolean;
  pointsLots: boolean;
  rewardsCatalog: boolean;
  loginActivity: boolean;
  reengagementActions: boolean;
  earningRules: boolean;
  redemptionSettings: boolean;
};

const adminDataCache = new Map<string, { snapshot: AdminDataSnapshot; loadedAt: number }>();
let expiryProcessedAt = 0;

function transactionLabel(tx: LoyaltyTransaction) {
  return String(tx.reason ?? tx.description ?? "").trim();
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = (day + 6) % 7;
  next.setDate(next.getDate() - diff);
  next.setHours(0, 0, 0, 0);
  return next;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function txType(value: string) {
  const normalized = String(value || "").toUpperCase();
  if (normalized.includes("REDEEM")) return "redeemed";
  if (normalized.includes("EXPIRY")) return "expired";
  return "earned";
}

function useLocalDemoDataMode() {
  return (
    process.env.NEXT_PUBLIC_USE_REMOTE_LOYALTY_API !== "true" &&
    (process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true" ||
      process.env.NEXT_PUBLIC_USE_LOCAL_LOYALTY_API === "true")
  );
}

async function loadLocalRuntimePointMembers() {
  try {
    const payload = await requestJson<{
      ok?: boolean;
      snapshot?: { members?: LocalRuntimePointMember[] };
    }>("/api/local-runtime/points");
    return payload.snapshot?.members || [];
  } catch {
    return [];
  }
}

function adminCacheKey(scope: AdminDataScope, includeInsights: boolean, localDemoMode: boolean) {
  return `${scope}:${includeInsights ? "insights" : "base"}:${localDemoMode ? "local" : "remote"}`;
}

function resolveRequirements(scope: AdminDataScope, includeInsights: boolean): AdminDataRequirements {
  if (includeInsights || scope === "analytics") {
    return {
      memberSegments: true,
      tierHistory: true,
      pointsLots: true,
      rewardsCatalog: true,
      loginActivity: true,
      reengagementActions: true,
      earningRules: true,
      redemptionSettings: true,
    };
  }

  switch (scope) {
    case "dashboard":
      return {
        memberSegments: true,
        tierHistory: false,
        pointsLots: false,
        rewardsCatalog: false,
        loginActivity: false,
        reengagementActions: false,
        earningRules: false,
        redemptionSettings: false,
      };
    case "members":
      return {
        memberSegments: true,
        tierHistory: false,
        pointsLots: false,
        rewardsCatalog: false,
        loginActivity: false,
        reengagementActions: false,
        earningRules: false,
        redemptionSettings: false,
      };
    case "activity":
      return {
        memberSegments: false,
        tierHistory: false,
        pointsLots: false,
        rewardsCatalog: false,
        loginActivity: false,
        reengagementActions: false,
        earningRules: false,
        redemptionSettings: false,
      };
    case "rewards":
      return {
        memberSegments: false,
        tierHistory: false,
        pointsLots: false,
        rewardsCatalog: true,
        loginActivity: false,
        reengagementActions: false,
        earningRules: false,
        redemptionSettings: false,
      };
    case "engagement":
      return {
        memberSegments: false,
        tierHistory: false,
        pointsLots: false,
        rewardsCatalog: false,
        loginActivity: true,
        reengagementActions: true,
        earningRules: false,
        redemptionSettings: false,
      };
    default:
      return {
        memberSegments: true,
        tierHistory: true,
        pointsLots: true,
        rewardsCatalog: true,
        loginActivity: true,
        reengagementActions: true,
        earningRules: true,
        redemptionSettings: true,
      };
  }
}

function fallbackNameFromEmail(email?: string | null) {
  const name = String(email || "").split("@")[0]?.trim();
  return name ? name.replace(/[._-]+/g, " ") : "Local Member";
}

function localMemberDisplayName(memberId: string, email?: string | null) {
  if (memberId === "MEM-000011" || String(email || "").toLowerCase() === "soundwave@example.com") {
    return "Sound Wave";
  }
  const fromEmail = fallbackNameFromEmail(email);
  if (fromEmail !== "Local Member") return fromEmail;
  return memberId.replace(/[._-]+/g, " ");
}

function overlayLocalRuntimePoints(
  members: Member[],
  transactions: LoyaltyTransaction[],
  localMembers: LocalRuntimePointMember[],
) {
  if (localMembers.length === 0) return { members, transactions };

  const nextMembers = [...members];
  const indexByMemberNumber = new Map<string, number>();
  const indexByEmail = new Map<string, number>();
  nextMembers.forEach((member, index) => {
    if (member.member_number) indexByMemberNumber.set(String(member.member_number), index);
    if (member.email) indexByEmail.set(String(member.email).toLowerCase(), index);
  });

  const existingTransactionIds = new Set(transactions.map((tx) => String(tx.transaction_id || "")));
  const localTransactions: LoyaltyTransaction[] = [];

  for (const localMember of localMembers) {
    const byNumber = indexByMemberNumber.get(localMember.memberId);
    const byEmail = localMember.email ? indexByEmail.get(localMember.email.toLowerCase()) : undefined;
    const existingIndex = byNumber ?? byEmail;
    const existing = existingIndex !== undefined ? nextMembers[existingIndex] : undefined;
    const displayName = localMemberDisplayName(localMember.memberId, localMember.email);
    const [firstNameFallback, ...lastNameFallback] = displayName.split(" ");
    const mergedMember: Member = {
      member_id: existing?.member_id ?? localMember.memberId,
      id: existing?.id ?? localMember.memberId,
      member_number: existing?.member_number || localMember.memberId,
      first_name: existing?.first_name || firstNameFallback || "Local",
      last_name: existing?.last_name || lastNameFallback.join(" ") || "Member",
      email: existing?.email || localMember.email || "",
      phone: existing?.phone ?? null,
      enrollment_date: existing?.enrollment_date || new Date().toISOString(),
      points_balance: localMember.pointsBalance,
      tier: localMember.tier,
      manual_segment: existing?.manual_segment ?? null,
      auto_segment: existing?.auto_segment ?? (localMember.pointsBalance >= 500 ? "High Value" : "Active"),
      effective_segment:
        existing?.effective_segment ?? existing?.manual_segment ?? existing?.auto_segment ?? (localMember.pointsBalance >= 500 ? "High Value" : "Active"),
      custom_segments: existing?.custom_segments,
      last_activity_at: existing?.last_activity_at ?? localMember.history[0]?.date ?? null,
      sms_enabled: existing?.sms_enabled,
      email_enabled: existing?.email_enabled,
      push_enabled: existing?.push_enabled,
      promotional_opt_in: existing?.promotional_opt_in,
      communication_frequency: existing?.communication_frequency,
    };

    if (existingIndex !== undefined) nextMembers[existingIndex] = mergedMember;
    else {
      indexByMemberNumber.set(mergedMember.member_number, nextMembers.length);
      if (mergedMember.email) indexByEmail.set(mergedMember.email.toLowerCase(), nextMembers.length);
      nextMembers.push(mergedMember);
    }

    for (const localTx of localMember.history) {
      if (existingTransactionIds.has(localTx.id)) continue;
      existingTransactionIds.add(localTx.id);
      localTransactions.push({
        transaction_id: localTx.id,
        member_id: String(mergedMember.member_id),
        points: Number(localTx.points || 0),
        transaction_type: localTx.type,
        transaction_date: localTx.date,
        expiry_date: localTx.expiry_date,
        reward_catalog_id: localTx.reference,
        reason: localTx.reason,
        description: localTx.reason,
        loyalty_members: {
          first_name: mergedMember.first_name,
          last_name: mergedMember.last_name,
          member_number: mergedMember.member_number,
        },
      });
    }
  }

  return {
    members: nextMembers,
    transactions: [...localTransactions, ...transactions].sort(
      (left, right) => new Date(right.transaction_date).getTime() - new Date(left.transaction_date).getTime(),
    ),
  };
}

function isMissingRelationError(error: unknown, table: string) {
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

function isMissingColumnError(error: unknown, table: string, column: string) {
  const message = String(
    (error as { message?: unknown; details?: unknown; hint?: unknown })?.message ??
      (error as { details?: unknown })?.details ??
      (error as { hint?: unknown })?.hint ??
      ""
  ).toLowerCase();

  return (
    message.includes(`column ${table.toLowerCase()}.${column.toLowerCase()} does not exist`) ||
    message.includes(`column "${column.toLowerCase()}" does not exist`) ||
    message.includes(`could not find the '${column.toLowerCase()}' column`) ||
    (message.includes(column.toLowerCase()) && message.includes("does not exist"))
  );
}

export function useAdminData(options?: { includeInsights?: boolean; scope?: AdminDataScope }) {
  const includeInsights = options?.includeInsights ?? false;
  const scope = options?.scope ?? "all";
  const [members, setMembers] = useState<Member[]>([]);
  const [redemptions, setRedemptions] = useState<LoyaltyTransaction[]>([]);
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([]);
  const [tierHistory, setTierHistory] = useState<TierHistoryRow[]>([]);
  const [pointsLots, setPointsLots] = useState<PointsLot[]>([]);
  const [rewardsCatalog, setRewardsCatalog] = useState<RewardCatalogRow[]>([]);
  const [loginActivity, setLoginActivity] = useState<MemberLoginActivity[]>([]);
  const [reengagementActions, setReengagementActions] = useState<ReengagementAction[]>([]);
  const [tierRules, setTierRules] = useState<TierRule[]>([]);
  const [earningRules, setEarningRules] = useState<EarningRule[]>([]);
  const [redemptionValuePerPoint, setRedemptionValuePerPoint] = useState<number>(0.01);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applySnapshot = useCallback((snapshot: AdminDataSnapshot) => {
    setMembers(snapshot.members);
    setRedemptions(snapshot.redemptions);
    setTransactions(snapshot.transactions);
    setTierHistory(snapshot.tierHistory);
    setPointsLots(snapshot.pointsLots);
    setRewardsCatalog(snapshot.rewardsCatalog);
    setLoginActivity(snapshot.loginActivity);
    setReengagementActions(snapshot.reengagementActions);
    setTierRules(snapshot.tierRules);
    setEarningRules(snapshot.earningRules);
    setRedemptionValuePerPoint(snapshot.redemptionValuePerPoint);
  }, []);

  const fetchData = useCallback(async (options?: { force?: boolean }) => {
    try {
      const now = Date.now();
      const localDemoMode = useLocalDemoDataMode();
      const cacheKey = adminCacheKey(scope, includeInsights, localDemoMode);
      const requirements = resolveRequirements(scope, includeInsights);
      const cached = adminDataCache.get(cacheKey);
      if (!options?.force && cached && now - cached.loadedAt < ADMIN_CACHE_TTL_MS) {
        applySnapshot(cached.snapshot);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      if (localDemoMode) {
        const localRuntimePointMembers = await loadLocalRuntimePointMembers();
        const localOverlay = overlayLocalRuntimePoints([], [], localRuntimePointMembers);
        const nextTransactions = localOverlay.transactions;
        const snapshot: AdminDataSnapshot = {
          members: localOverlay.members,
          redemptions: nextTransactions.filter((tx) => txType(tx.transaction_type) === "redeemed"),
          transactions: nextTransactions,
          tierHistory: [],
          pointsLots: [],
          rewardsCatalog: [],
          loginActivity: [],
          reengagementActions: [],
          tierRules: DEFAULT_TIER_RULES,
          earningRules: DEFAULT_EARNING_RULES,
          redemptionValuePerPoint: 0.01,
        };
        adminDataCache.set(cacheKey, { snapshot, loadedAt: Date.now() });
        applySnapshot(snapshot);
        return;
      }

      if (now - expiryProcessedAt > EXPIRY_PROCESS_INTERVAL_MS) {
        expiryProcessedAt = now;
        void processAllMemberExpiredPoints().catch((expiryErr) => {
          console.warn("Expiry processing failed in admin fetch:", expiryErr);
        });
      }

      const [
        membersRes,
        memberSegmentsRes,
        transactionsRes,
        tierHistoryRes,
        pointsLotsRes,
        rewardsCatalogRes,
        loginActivityRes,
        reengagementActionsRes,
        rules,
        earningRulesRes,
        redemptionSettingsRes,
        localRuntimePointMembers,
      ] = await Promise.all([
        supabase
          .from("loyalty_members")
          .select("*")
          .order("enrollment_date", { ascending: false })
          .limit(MEMBER_LIMIT),
        requirements.memberSegments
          ? supabase.rpc("loyalty_member_segments")
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("loyalty_transactions")
          .select("*, loyalty_members(first_name,last_name,member_number)")
          .order("transaction_date", { ascending: false })
          .limit(TRANSACTION_LIMIT),
        requirements.tierHistory
          ? supabase.from("tier_history").select("*").order("changed_at", { ascending: false }).limit(SUPPORTING_ROW_LIMIT)
          : Promise.resolve({ data: [], error: null }),
        requirements.pointsLots
          ? supabase
              .from("points_lots")
              .select("*")
              .order("expiry_date", { ascending: true })
              .limit(SUPPORTING_ROW_LIMIT)
          : Promise.resolve({ data: [], error: null }),
        requirements.rewardsCatalog
          ? supabase
              .from("rewards_catalog")
              .select("*")
              .order("points_cost", { ascending: true })
              .limit(SUPPORTING_ROW_LIMIT)
          : Promise.resolve({ data: [], error: null }),
        requirements.loginActivity
          ? supabase.from("member_login_activity").select("*").order("login_at", { ascending: false }).limit(ACTIVITY_ROW_LIMIT)
          : Promise.resolve({ data: [], error: null }),
        requirements.reengagementActions
          ? supabase
              .from("member_reengagement_actions")
              .select("*")
              .order("created_at", { ascending: false })
              .limit(ACTIVITY_ROW_LIMIT)
          : Promise.resolve({ data: [], error: null }),
        fetchTierRules(),
        requirements.earningRules ? fetchActiveEarningRules() : Promise.resolve(DEFAULT_EARNING_RULES),
        requirements.redemptionSettings
          ? supabase
              .from("redemption_settings")
              .select("redemption_value_per_point")
              .eq("is_active", true)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        loadLocalRuntimePointMembers(),
      ]);

      if (membersRes.error) throw membersRes.error;
      if (
        memberSegmentsRes.error &&
        !isMissingColumnError(memberSegmentsRes.error, "loyalty_members", "auto_segment") &&
        !isMissingColumnError(memberSegmentsRes.error, "loyalty_members", "effective_segment") &&
        !isMissingColumnError(memberSegmentsRes.error, "loyalty_members", "manual_segment") &&
        !isMissingRelationError(memberSegmentsRes.error, "loyalty_member_segments")
      ) {
        throw memberSegmentsRes.error;
      }
      if (transactionsRes.error) throw transactionsRes.error;
      if (pointsLotsRes.error && !isMissingRelationError(pointsLotsRes.error, "points_lots")) throw pointsLotsRes.error;
      if (rewardsCatalogRes.error && !isMissingRelationError(rewardsCatalogRes.error, "rewards_catalog")) throw rewardsCatalogRes.error;
      if (loginActivityRes.error && !isMissingRelationError(loginActivityRes.error, "member_login_activity")) throw loginActivityRes.error;
      if (reengagementActionsRes.error && !isMissingRelationError(reengagementActionsRes.error, "member_reengagement_actions")) {
        throw reengagementActionsRes.error;
      }

      const segmentRows = (memberSegmentsRes.error ? [] : memberSegmentsRes.data || []) as MemberSegmentRow[];
      const segmentByMemberId = new Map<string, MemberSegmentRow>();
      const segmentByMemberNumber = new Map<string, MemberSegmentRow>();
      for (const row of segmentRows) {
        const memberIdKey = String(row.member_id ?? "");
        const memberNumberKey = String(row.member_number ?? "");
        if (memberIdKey) segmentByMemberId.set(memberIdKey, row);
        if (memberNumberKey) segmentByMemberNumber.set(memberNumberKey, row);
      }

      const membersWithSegments = ((membersRes.data || []) as Member[]).map((member) => {
        const byId = segmentByMemberId.get(String(member.id ?? member.member_id ?? ""));
        const byNumber = segmentByMemberNumber.get(String(member.member_number ?? ""));
        const segment = byId || byNumber;
        if (!segment) {
          const balance = Number(member.points_balance || 0);
          const fallbackSegment = balance >= 500 ? "High Value" : "Active";
          return {
            ...member,
            auto_segment: member.auto_segment ?? fallbackSegment,
            effective_segment: member.effective_segment ?? member.manual_segment ?? member.auto_segment ?? fallbackSegment,
            last_activity_at: member.last_activity_at ?? null,
          };
        }
        return {
          ...member,
          auto_segment: (segment.auto_segment as Member["auto_segment"]) ?? null,
          manual_segment: (segment.manual_segment as Member["manual_segment"]) ?? null,
          effective_segment: (segment.effective_segment as Member["effective_segment"]) ?? null,
          last_activity_at: segment.last_activity_at ?? null,
        };
      });

      const supabaseTransactions = ((transactionsRes.data || []) as unknown as Array<
        Omit<LoyaltyTransaction, "loyalty_members"> & {
          loyalty_members?: LoyaltyTransaction["loyalty_members"] | LoyaltyTransaction["loyalty_members"][];
        }
      >).map((transaction) => ({
        ...transaction,
        loyalty_members: Array.isArray(transaction.loyalty_members)
          ? transaction.loyalty_members[0]
          : transaction.loyalty_members,
      })) as LoyaltyTransaction[];
      const localOverlay = overlayLocalRuntimePoints(membersWithSegments, supabaseTransactions, localRuntimePointMembers);
      const nextMembers = localOverlay.members;
      const nextTransactions = localOverlay.transactions;
      const rawRate = redemptionSettingsRes.data?.redemption_value_per_point;
      const parsedRate = Number(rawRate ?? 0.01);
      const snapshot: AdminDataSnapshot = {
        members: nextMembers,
        redemptions: nextTransactions.filter((tx) => txType(tx.transaction_type) === "redeemed"),
        transactions: nextTransactions,
        tierHistory: (tierHistoryRes.error ? [] : tierHistoryRes.data || []) as TierHistoryRow[],
        pointsLots: pointsLotsRes.error ? [] : ((pointsLotsRes.data || []) as PointsLot[]),
        rewardsCatalog: rewardsCatalogRes.error ? [] : ((rewardsCatalogRes.data || []) as RewardCatalogRow[]),
        loginActivity: loginActivityRes.error ? [] : ((loginActivityRes.data || []) as MemberLoginActivity[]),
        reengagementActions: reengagementActionsRes.error ? [] : ((reengagementActionsRes.data || []) as ReengagementAction[]),
        tierRules: rules,
        earningRules: earningRulesRes,
        redemptionValuePerPoint: Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : 0.01,
      };
      adminDataCache.set(cacheKey, { snapshot, loadedAt: Date.now() });
      applySnapshot(snapshot);
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : e && typeof e === "object" && "message" in e
          ? String((e as { message?: unknown }).message ?? "Failed to load admin data.")
          : "Failed to load admin data.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [applySnapshot, includeInsights, scope]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") fetchData({ force: true });
    };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [fetchData]);

  const metrics = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = startOfWeek(now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const growthSeries: MemberGrowthPoint[] = [];
    const earnedPointsSeries: SeriesPoint[] = [];
    const redemptionSeries: SeriesPoint[] = [];
    const tierMovementTrend: TierMovementPoint[] = [];

    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = monthKey(date);
      const label = monthLabel(date);
      growthSeries.push({ key, label, count: 0 });
      earnedPointsSeries.push({ key, label, value: 0 });
      redemptionSeries.push({ key, label, value: 0 });
      tierMovementTrend.push({ key, label, upgrades: 0, downgrades: 0 });
    }

    const latestTxByMember = new Map<string, Date>();
    const earnedPointsByMember = new Map<string, number>();
    for (const tx of transactions) {
      const parsed = parseDate(tx.transaction_date);
      const memberKey = String(tx.member_id);
      if (parsed) {
        const existing = latestTxByMember.get(memberKey);
        if (!existing || parsed > existing) latestTxByMember.set(memberKey, parsed);
      }

      if (txType(tx.transaction_type) === "earned" && Number(tx.points || 0) > 0) {
        earnedPointsByMember.set(memberKey, (earnedPointsByMember.get(memberKey) || 0) + Number(tx.points || 0));
      }
      if (!parsed) continue;
      const monthlyPoint = growthSeries.find((point) => point.key === monthKey(parsed));
      if (!monthlyPoint) continue;

      const seriesPoint = txType(tx.transaction_type) === "redeemed" ? redemptionSeries : earnedPointsSeries;
      const match = seriesPoint.find((point) => point.key === monthKey(parsed));
      if (!match) continue;

      if (txType(tx.transaction_type) === "redeemed") {
        match.value += Math.abs(Number(tx.points || 0));
      } else if (Number(tx.points || 0) > 0) {
        match.value += Number(tx.points || 0);
      }
    }

    for (const member of members) {
      const joined = parseDate(member.enrollment_date);
      if (!joined) continue;
      const point = growthSeries.find((entry) => entry.key === monthKey(joined));
      if (point) point.count += 1;
    }

    for (const row of tierHistory) {
      const changed = parseDate(row.changed_at);
      if (!changed) continue;
      const point = tierMovementTrend.find((entry) => entry.key === monthKey(changed));
      if (!point) continue;
      const oldTier = String(row.old_tier || "").toLowerCase();
      const newTier = String(row.new_tier || "").toLowerCase();
      const rank = (tier: string) => (tier === "gold" ? 3 : tier === "silver" ? 2 : tier === "bronze" ? 1 : 0);
      if (rank(newTier) > rank(oldTier)) point.upgrades += 1;
      if (rank(newTier) < rank(oldTier)) point.downgrades += 1;
    }

    const totalMembers = members.length;
    const pointsLiability = members.reduce((sum, member) => sum + Number(member.points_balance || 0), 0);
    const totalPointsRedeemed = redemptions.reduce((sum, tx) => sum + Math.abs(Number(tx.points || 0)), 0);

    const activeMembers = members.filter((member) => {
      const memberKey = String(member.id ?? member.member_id ?? "");
      const lastTx = latestTxByMember.get(memberKey);
      return lastTx ? now.getTime() - lastTx.getTime() <= 30 * 24 * 60 * 60 * 1000 : false;
    }).length;

    const tierDistribution: TierDistribution = members.reduce(
      (acc, member) => {
        const balance = Number(member.points_balance || 0);
        const tier = resolveTier(balance, tierRules).toLowerCase();
        if (tier === "gold") acc.gold += 1;
        else if (tier === "silver") acc.silver += 1;
        else acc.bronze += 1;
        return acc;
      },
      { gold: 0, silver: 0, bronze: 0 }
    );

    const newMembersToday = members.filter((member) => {
      const joined = parseDate(member.enrollment_date);
      return joined ? joined >= todayStart : false;
    }).length;

    const newMembersThisWeek = members.filter((member) => {
      const joined = parseDate(member.enrollment_date);
      return joined ? joined >= weekStart : false;
    }).length;

    const newMembersThisMonth = members.filter((member) => {
      const joined = parseDate(member.enrollment_date);
      return joined ? joined >= monthStart : false;
    }).length;

    const previousMonthKey = growthSeries[growthSeries.length - 2]?.key;
    const newMembersLastMonth = previousMonthKey
      ? growthSeries.find((point) => point.key === previousMonthKey)?.count ?? 0
      : 0;
    const growthRate =
      newMembersLastMonth > 0
        ? ((newMembersThisMonth - newMembersLastMonth) / newMembersLastMonth) * 100
        : newMembersThisMonth > 0
        ? 100
        : 0;

    const memberSegments = [
      {
        label: "Active (30d)",
        count: members.filter((member) => {
          const key = String(member.id ?? member.member_id ?? "");
          const lastTx = latestTxByMember.get(key);
          return lastTx ? now.getTime() - lastTx.getTime() <= 30 * 24 * 60 * 60 * 1000 : false;
        }).length,
      },
      {
        label: "Warm (31-90d)",
        count: members.filter((member) => {
          const key = String(member.id ?? member.member_id ?? "");
          const lastTx = latestTxByMember.get(key);
          if (!lastTx) return false;
          const age = now.getTime() - lastTx.getTime();
          return age > 30 * 24 * 60 * 60 * 1000 && age <= 90 * 24 * 60 * 60 * 1000;
        }).length,
      },
      {
        label: "Dormant (90d+)",
        count: members.filter((member) => {
          const key = String(member.id ?? member.member_id ?? "");
          const lastTx = latestTxByMember.get(key);
          if (!lastTx) return true;
          return now.getTime() - lastTx.getTime() > 90 * 24 * 60 * 60 * 1000;
        }).length,
      },
    ];

    const memberActivityRows: MemberActivityRow[] = members.map((member) => {
      const memberKey = String(member.id ?? member.member_id ?? "");
      const lastTx = latestTxByMember.get(memberKey);
      const earnedPoints = earnedPointsByMember.get(memberKey) || 0;

      let activityLevel: MemberActivityRow["activityLevel"] = "inactive";
      if (lastTx) {
        const ageDays = (now.getTime() - lastTx.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays <= 30) activityLevel = "active";
        else if (ageDays <= 90) activityLevel = "warm";
      }

      return {
        memberNumber: member.member_number || "N/A",
        fullName: `${member.first_name} ${member.last_name}`.trim(),
        lastActivityDate: lastTx ? lastTx.toISOString() : null,
        activityLevel,
        earnedPoints,
      };
    });

    const rewardPopularityMap = new Map<string, number>();
    for (const tx of transactions) {
      if (txType(tx.transaction_type) !== "redeemed") continue;
      const label = transactionLabel(tx) || "General Reward";
      rewardPopularityMap.set(label, (rewardPopularityMap.get(label) || 0) + 1);
    }
    const rewardPopularity: RewardPopularityRow[] = Array.from(rewardPopularityMap.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const totalEarnedPoints = transactions
      .filter((tx) => txType(tx.transaction_type) === "earned" && Number(tx.points || 0) > 0)
      .reduce((sum, tx) => sum + Number(tx.points || 0), 0);
    const redemptionRate =
      totalEarnedPoints > 0 ? Number(((totalPointsRedeemed / totalEarnedPoints) * 100).toFixed(2)) : 0;

    const monetaryLiability = Number((pointsLiability * redemptionValuePerPoint).toFixed(2));
    const liabilityTrend = growthSeries.map((point) => {
      const monthPoints = members.reduce((sum, member) => {
        const joined = parseDate(member.enrollment_date);
        return joined && monthKey(joined) <= point.key ? sum + Number(member.points_balance || 0) : sum;
      }, 0);
      return {
        month: point.label,
        points: monthPoints,
        monetary: Number((monthPoints * redemptionValuePerPoint).toFixed(2)),
      };
    });

    return {
      totalMembers,
      activeMembers,
      pointsLiability,
      totalPointsRedeemed,
      tierDistribution,
      newMembersToday,
      newMembersThisWeek,
      newMembersThisMonth,
      newMembersLastMonth,
      growthRate,
      growthSeries,
      earnedPointsSeries,
      redemptionSeries,
      memberSegments,
      memberActivityRows,
      rewardPopularity,
      redemptionRate,
      tierMovementTrend,
      redemptionValuePerPoint,
      monetaryLiability,
      liabilityTrend,
    } satisfies AdminMetrics;
  }, [members, redemptions, transactions, tierHistory, tierRules, redemptionValuePerPoint]);

  const insights = useMemo(
    () =>
      includeInsights
        ? buildAdvancedAnalyticsDatasets({
            members,
            transactions,
            pointsLots,
            rewardsCatalog,
            loginActivity,
            reengagementActions,
            tierRules,
            redemptionValuePerPoint,
          })
        : EMPTY_ADMIN_INSIGHTS,
    [includeInsights, members, transactions, pointsLots, rewardsCatalog, loginActivity, reengagementActions, tierRules, redemptionValuePerPoint]
  );

  return {
    members,
    transactions,
    pointsLots,
    rewardsCatalog,
    loginActivity,
    reengagementActions,
    loading,
    error,
    metrics,
    insights,
    tierRules,
    earningRules,
    redemptionValuePerPoint,
    refetch: () => fetchData({ force: true }),
  };
}
