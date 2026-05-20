import { useCallback, useEffect, useMemo, useState } from "react";
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
  loadReengagementActions,
  processAllMemberExpiredPoints,
  type EarningRule,
} from "../../lib/loyalty-supabase";
import { loadPointsLedgerViaApi, requestJson } from "../../lib/api";
import { resolveTier, type TierRule } from "../../lib/loyalty-engine";
import { buildAdvancedAnalyticsDatasets } from "../lib/advanced-insights";

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
  if (normalized.includes("REDEEM") || normalized.includes("GIFT")) return "redeemed";
  if (normalized.includes("EXPIRY")) return "expired";
  return "earned";
}

function usesStrictMicroservices() {
  return (
    process.env.USE_SPLIT_SERVICE_DATABASES === "true" ||
    process.env.NEXT_PUBLIC_USE_SPLIT_SERVICE_DATABASES === "true" ||
    process.env.USE_REMOTE_LOYALTY_API === "true" ||
    process.env.NEXT_PUBLIC_USE_REMOTE_LOYALTY_API === "true"
  );
}

export function useAdminData() {
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

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      try {
        await processAllMemberExpiredPoints();
      } catch (expiryErr) {
        console.warn("Expiry processing failed in admin fetch:", expiryErr);
      }

      const [
        membersRes,
        pointsLedgerRes,
        rewardsRes,
        reengagementActionsRes,
        rules,
        earningRulesRes,
      ] = await Promise.all([
        requestJson<{ ok: true; members: Member[] }>("/api/admin/members").catch((membersError) => ({
          ok: false as const,
          error: membersError,
        })),
        loadPointsLedgerViaApi(5000).catch((ledgerError) => ({ ok: false as const, error: ledgerError })),
        requestJson<{ ok: true; rewards: RewardCatalogRow[] }>("/api/rewards").catch((rewardsError) => ({
          ok: false as const,
          error: rewardsError,
        })),
        loadReengagementActions().catch((actionsError) => ({ ok: false as const, error: actionsError })),
        fetchTierRules(),
        fetchActiveEarningRules(),
      ]);

      if (!membersRes.ok) {
        const membersError = membersRes.error;
        throw membersError instanceof Error ? membersError : new Error("Failed to load members.");
      }
      if (!pointsLedgerRes.ok && usesStrictMicroservices()) {
        const ledgerError = pointsLedgerRes.error;
        throw ledgerError instanceof Error ? ledgerError : new Error("Failed to load points ledger.");
      }

      const segmentRows = [] as MemberSegmentRow[];
      const segmentByMemberId = new Map<string, MemberSegmentRow>();
      const segmentByMemberNumber = new Map<string, MemberSegmentRow>();
      for (const row of segmentRows) {
        const memberIdKey = String(row.member_id ?? "");
        const memberNumberKey = String(row.member_number ?? "");
        if (memberIdKey) segmentByMemberId.set(memberIdKey, row);
        if (memberNumberKey) segmentByMemberNumber.set(memberNumberKey, row);
      }

      const membersWithSegments = ((membersRes.members || []) as Member[]).map((member) => {
        const byId = segmentByMemberId.get(String(member.id ?? member.member_id ?? ""));
        const byNumber = segmentByMemberNumber.get(String(member.member_number ?? ""));
        const segment = byId || byNumber;
        if (!segment) return member;
        return {
          ...member,
          auto_segment: (segment.auto_segment as Member["auto_segment"]) ?? null,
          manual_segment: (segment.manual_segment as Member["manual_segment"]) ?? null,
          effective_segment: (segment.effective_segment as Member["effective_segment"]) ?? null,
          last_activity_at: segment.last_activity_at ?? null,
        };
      });

      const memberByDatabaseId = new Map<string, Member>();
      for (const member of membersWithSegments) {
        const databaseId = String(member.id ?? member.member_id ?? "");
        if (databaseId) memberByDatabaseId.set(databaseId, member);
      }

      const ledgerTransactions =
        pointsLedgerRes.ok
          ? (pointsLedgerRes.transactions || []).map((tx) => {
              const member = memberByDatabaseId.get(String(tx.member_id));
              return {
                ...tx,
                member_id: String(tx.member_id),
                transaction_id: tx.transaction_id ? String(tx.transaction_id) : String(tx.id ?? ""),
                transaction_date: String(tx.transaction_date ?? new Date().toISOString()),
                points: Number(tx.points || 0),
                reason: tx.reason ?? undefined,
                loyalty_members: member
                  ? {
                      first_name: member.first_name,
                      last_name: member.last_name,
                      member_number: member.member_number,
                    }
                  : undefined,
              } satisfies LoyaltyTransaction;
            })
          : [];
      const transactionRows =
        ledgerTransactions.length > 0 || usesStrictMicroservices()
          ? ledgerTransactions
          : [];
      const redemptionRows = transactionRows.filter((tx) => txType(tx.transaction_type) === "redeemed");

      setMembers(membersWithSegments);
      setRedemptions(redemptionRows);
      setTransactions(transactionRows);
      setTierHistory([]);
      setPointsLots([]);
      setRewardsCatalog(rewardsRes.ok ? rewardsRes.rewards || [] : []);
      setLoginActivity([]);
      setReengagementActions(Array.isArray(reengagementActionsRes) ? (reengagementActionsRes as ReengagementAction[]) : []);
      setTierRules(rules);
      setEarningRules(earningRulesRes);

      const rawRate = 0.01;
      const parsedRate = Number(rawRate ?? 0.01);
      setRedemptionValuePerPoint(Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : 0.01);
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
  }, []);

  useEffect(() => {
    fetchData();
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
    for (const tx of transactions) {
      const parsed = parseDate(tx.transaction_date);
      if (!parsed) continue;
      const existing = latestTxByMember.get(String(tx.member_id));
      if (!existing || parsed > existing) latestTxByMember.set(String(tx.member_id), parsed);

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
      const earnedPoints = transactions
        .filter((tx) => String(tx.member_id) === memberKey && txType(tx.transaction_type) === "earned" && Number(tx.points || 0) > 0)
        .reduce((sum, tx) => sum + Number(tx.points || 0), 0);

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
      const monthMembers = members.filter((member) => {
        const joined = parseDate(member.enrollment_date);
        return joined ? monthKey(joined) <= point.key : false;
      });
      const monthPoints = monthMembers.reduce((sum, member) => sum + Number(member.points_balance || 0), 0);
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
      buildAdvancedAnalyticsDatasets({
        members,
        transactions,
        pointsLots,
        rewardsCatalog,
        loginActivity,
        reengagementActions,
        tierRules,
        redemptionValuePerPoint,
      }),
    [members, transactions, pointsLots, rewardsCatalog, loginActivity, reengagementActions, tierRules, redemptionValuePerPoint]
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
    refetch: fetchData,
  };
}
