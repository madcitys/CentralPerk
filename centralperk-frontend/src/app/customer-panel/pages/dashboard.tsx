import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  Gift,
  HeartPulse,
  Home,
  Info,
  Megaphone,
  Pill,
  ReceiptText,
  Settings,
  ShoppingBag,
  Sparkles,
  Trophy,
  Truck,
  Zap,
} from "lucide-react";
import { Link, useOutletContext } from "react-router-dom";
import { Card } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Progress } from "../../../components/ui/progress";
import { cn } from "../../../components/ui/utils";
import type { AppOutletContext } from "../../types/app-context";
import type { Reward, Transaction } from "../../types/loyalty";
import type { PromotionCampaign } from "../../lib/promotions";
import { loadActiveCampaignsViaApi, loadRewardsViaApi } from "../../lib/api";
import { loadNotificationCampaigns, type NotificationCampaign } from "../../lib/member-engagement";
import { fetchEarningRules, fetchTierRulesViaService } from "../../lib/points-service-client";
import { normalizeTransactionDescription } from "../../lib/reward-display";

type TierName = string;
type TierRuleRow = {
  tier_label: string;
  min_points: number;
};
type TierLevel = {
  name: string;
  min: number;
};
type EarningRuleRow = {
  tier_label: string;
  peso_per_point?: number;
  multiplier?: number;
  is_active?: boolean;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatCampaignCountdown(endsAt: string, nowMs: number) {
  const diff = new Date(endsAt).getTime() - nowMs;
  if (Number.isNaN(diff)) return "Schedule unavailable";
  if (diff <= 0) return "Expired";

  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${Math.max(minutes, 1)}m left`;
}

function normalizeTierName(value: string) {
  return value.trim().replace(/\s+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function transactionMonthSummary(transactions: Transaction[], offset: 0 | -1) {
  const anchor = new Date();
  anchor.setMonth(anchor.getMonth() + offset);
  const key = monthKey(anchor);

  return transactions.reduce(
    (summary, transaction) => {
      const date = new Date(transaction.date);
      if (Number.isNaN(date.getTime()) || monthKey(date) !== key) return summary;

      if (transaction.type === "earned") {
        summary.earned += Math.max(0, Number(transaction.points) || 0);
        summary.earnCount += 1;
      }

      if (transaction.type === "redeemed") {
        summary.redeemed += Math.abs(Number(transaction.points) || 0);
        summary.redeemCount += 1;
      }

      return summary;
    },
    { earned: 0, redeemed: 0, earnCount: 0, redeemCount: 0 },
  );
}

function trendLabel(current: number, previous: number, transactionCount: number, noun: string) {
  if (previous > 0) {
    const change = Math.round(((current - previous) / previous) * 100);
    return `${change >= 0 ? "+" : ""}${change}% vs last month`;
  }
  if (transactionCount > 0) return `${transactionCount.toLocaleString()} ${noun}`;
  return `No ${noun}`;
}

function transactionIcon(transaction: Transaction) {
  const text = `${transaction.description} ${transaction.category ?? ""}`.toLowerCase();
  if (transaction.type === "redeemed") return Gift;
  if (text.includes("prescription") || text.includes("medicine") || text.includes("pharmacy")) return Pill;
  if (text.includes("health") || text.includes("wellness")) return HeartPulse;
  if (text.includes("product") || text.includes("purchase")) return ShoppingBag;
  return ReceiptText;
}

function notificationCampaignMatchesMember(campaign: NotificationCampaign, tier: string, points: number) {
  const segment = campaign.segment.toLowerCase();
  const tierName = tier.toLowerCase();
  if (segment === "all members") return true;
  if (segment === tierName) return true;
  if (segment === "high value") return points >= 50000 || tierName === "gold";
  return false;
}

function notificationCampaignToPromotionCampaign(campaign: NotificationCampaign): PromotionCampaign {
  const scheduledAt = new Date(campaign.scheduledFor);
  const startsAt = Number.isNaN(scheduledAt.getTime()) ? new Date() : scheduledAt;
  const endsAt = new Date(startsAt.getTime() + 14 * 24 * 60 * 60 * 1000);

  return {
    id: `notification-${campaign.id}`,
    campaignCode: `PUSH-${campaign.id}`,
    campaignName: campaign.name,
    description: campaign.variantA || `Scheduled ${campaign.trigger.toLowerCase()} message for ${campaign.segment}.`,
    campaignType: campaign.trigger === "Flash Sale" ? "flash_sale" : "bonus_points",
    status: campaign.status === "completed" ? "completed" : "scheduled",
    multiplier: 1,
    minimumPurchaseAmount: 0,
    bonusPoints: campaign.trigger === "Flash Sale" ? 0 : 50,
    productScope: [],
    eligibleTiers: campaign.segment === "All Members" || campaign.segment === "High Value" ? [] : [campaign.segment],
    rewardId: null,
    rewardName: null,
    rewardPointsCost: null,
    rewardImageUrl: null,
    flashSaleQuantityLimit: campaign.trigger === "Flash Sale" ? Math.max(campaign.audienceSize, 1) : null,
    flashSaleClaimedCount: campaign.trigger === "Flash Sale" ? campaign.openedCount : 0,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    countdownLabel: campaign.status === "live" ? "Live now" : "Scheduled push",
    bannerTitle: campaign.name,
    bannerMessage: campaign.variantB || campaign.variantA || "A pharmacy rewards campaign is available for your account.",
    bannerColor: "#008c80",
    pushNotificationEnabled: true,
  };
}

export default function Dashboard() {
  const { user, notificationCount = 0, openNotifications } = useOutletContext<AppOutletContext>();
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [tierLevels, setTierLevels] = useState<TierLevel[]>([]);
  const [earningRules, setEarningRules] = useState<EarningRuleRow[]>([]);
  const [activeCampaigns, setActiveCampaigns] = useState<PromotionCampaign[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);

  const resolvedTierLevels = useMemo(
    () =>
      (tierLevels.length > 0 ? tierLevels : [{ name: user.tier, min: 0 }])
        .filter((tier) => tier.name)
        .sort((a, b) => a.min - b.min),
    [tierLevels, user.tier],
  );

  const derivedTierName = useMemo<TierName>(() => {
    const userTier = resolvedTierLevels.find((tier) => tier.name.toLowerCase() === user.tier.toLowerCase());
    if (userTier) return userTier.name;
    const level = [...resolvedTierLevels].sort((a, b) => b.min - a.min).find((tier) => user.points >= tier.min);
    return (level?.name ?? user.tier) as TierName;
  }, [resolvedTierLevels, user.points, user.tier]);

  const currentTierData =
    resolvedTierLevels.find((tier) => tier.name.toLowerCase() === derivedTierName.toLowerCase()) ??
    [...resolvedTierLevels].sort((a, b) => b.min - a.min).find((tier) => user.points >= tier.min) ??
    resolvedTierLevels[0] ??
    { name: derivedTierName, min: 0 };
  const nextTierData = resolvedTierLevels.find((tier) => tier.min > user.points) ?? null;
  const progressBase = currentTierData.min;
  const progressTarget = nextTierData ? nextTierData.min : Math.max(user.points, currentTierData.min);
  const progressCurrent = user.points;
  const remainingProgressPoints = Math.max(0, progressTarget - progressCurrent);
  const tierProgress =
    !nextTierData
      ? 100
      : progressTarget > progressBase
        ? Math.min(100, Math.max(0, ((progressCurrent - progressBase) / (progressTarget - progressBase)) * 100))
        : 0;

  const recentTransactions = useMemo(
    () => [...user.transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5),
    [user.transactions],
  );

  const currentMonthSummary = useMemo(() => transactionMonthSummary(user.transactions, 0), [user.transactions]);
  const previousMonthSummary = useMemo(() => transactionMonthSummary(user.transactions, -1), [user.transactions]);

  const availableRewards = useMemo(
    () =>
      rewards
        .filter((reward) => reward.available && Number(reward.pointsCost) > 0)
        .sort((a, b) => a.pointsCost - b.pointsCost),
    [rewards],
  );

  const affordableRewards = useMemo(
    () => availableRewards.filter((reward) => reward.pointsCost <= user.points).sort((a, b) => b.pointsCost - a.pointsCost),
    [availableRewards, user.points],
  );

  const closestReward = affordableRewards[0] ?? availableRewards.find((reward) => reward.pointsCost > user.points) ?? null;
  const closestRewardNeeded = closestReward ? Math.max(0, closestReward.pointsCost - user.points) : 0;
  const currentEarningRule = earningRules.find((rule) => rule.tier_label?.toLowerCase() === derivedTierName.toLowerCase());
  const earningMultiplier = Number(currentEarningRule?.multiplier ?? 0);
  const pesoPerPoint = Number(currentEarningRule?.peso_per_point ?? 0);
  const tierBenefitRows = [
    {
      icon: Zap,
      title: "Earn More Points",
      body:
        earningMultiplier > 0
          ? `${derivedTierName} earning rate: ${earningMultiplier.toLocaleString()}x on eligible activity.`
          : pesoPerPoint > 0
            ? `Earn points from eligible activity at the active ${derivedTierName} rule.`
            : `${derivedTierName} earning rules are active.`,
    },
    {
      icon: Truck,
      title: "Priority Service",
      body:
        activeCampaigns.length > 0
          ? `${activeCampaigns.length.toLocaleString()} live campaign${activeCampaigns.length === 1 ? "" : "s"} matched to your tier.`
          : "Member service perks stay attached to your tier.",
    },
    {
      icon: HeartPulse,
      title: "Wellness Perks",
      body:
        availableRewards.length > 0
          ? `${affordableRewards.length.toLocaleString()} reward${affordableRewards.length === 1 ? "" : "s"} redeemable with your balance.`
          : "Wellness rewards appear when the catalog is published.",
    },
  ];

  useEffect(() => {
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void fetchTierRulesViaService()
      .then((response) => {
        const nextLevels = (response?.tiers ?? ([] as TierRuleRow[]))
          .map((rule) => ({
            name: normalizeTierName(String(rule.tier_label || "")),
            min: Math.max(0, Number(rule.min_points) || 0),
          }))
          .filter((tier) => tier.name);
        setTierLevels(nextLevels);
      })
      .catch(() => undefined);

    void fetchEarningRules()
      .then((response) => setEarningRules(response?.earningRules ?? []))
      .catch(() => setEarningRules([]));
  }, []);

  useEffect(() => {
    void Promise.allSettled([loadActiveCampaignsViaApi(user.tier), loadNotificationCampaigns()])
      .then(([promotionResult, notificationResult]) => {
        const promotionCampaigns = promotionResult.status === "fulfilled" ? promotionResult.value.campaigns : [];
        const notificationCampaigns =
          notificationResult.status === "fulfilled"
            ? notificationResult.value
                .filter((campaign) => campaign.status !== "completed")
                .filter((campaign) => notificationCampaignMatchesMember(campaign, user.tier, user.points))
                .map(notificationCampaignToPromotionCampaign)
            : [];
        const seen = new Set<string>();
        const mergedCampaigns = [...notificationCampaigns, ...promotionCampaigns].filter((campaign) => {
          const key = `${campaign.campaignName.toLowerCase()}-${campaign.startsAt}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setActiveCampaigns(mergedCampaigns);
      })
      .catch(() => setActiveCampaigns([]));
  }, [user.points, user.tier]);

  useEffect(() => {
    void loadRewardsViaApi()
      .then((response) => setRewards(response.rewards))
      .catch(() => setRewards([]));
  }, []);

  const activeCampaign = activeCampaigns[0] ?? null;
  const firstName = user.fullName.split(" ").filter(Boolean)[0] ?? user.fullName;
  const summaryCards = [
    {
      icon: Clock,
      title: "Pending Points",
      value: `${user.pendingPoints.toLocaleString()} pts`,
      detail: user.pendingPoints > 0 ? "Processing" : "None Pending",
      tone: "blue",
    },
    {
      icon: ArrowUpRight,
      title: "Earned This Month",
      value: `${user.earnedThisMonth.toLocaleString()} pts`,
      detail: trendLabel(user.earnedThisMonth, previousMonthSummary.earned, currentMonthSummary.earnCount, "earning transactions"),
      tone: "teal",
    },
    {
      icon: ArrowDownRight,
      title: "Redeemed This Month",
      value: `${user.redeemedThisMonth.toLocaleString()} pts`,
      detail: trendLabel(user.redeemedThisMonth, previousMonthSummary.redeemed, currentMonthSummary.redeemCount, "redemption transactions"),
      tone: "red",
    },
  ];
  const quickNavItems = [
    { label: "Dashboard", href: "/customer", icon: Home },
    { label: "Earn Points", href: "/customer/earn", icon: Gift },
    { label: "Activity", href: "/customer/activity", icon: ReceiptText },
    { label: "Rewards", href: "/customer/rewards", icon: ShoppingBag },
    { label: "Engagement", href: "/customer/engagement", icon: Sparkles },
    { label: "Profile", href: "/customer/profile", icon: Settings },
  ];

  return (
    <div
      className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f1fbf7_0%,#f7fafc_42%,#edf8f4_100%)] text-[#081a35]"
      style={{ fontFamily: "'Poppins', sans-serif" }}
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_10%_8%,rgba(0,140,128,0.12),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(8,126,96,0.10),transparent_28%),linear-gradient(90deg,rgba(0,140,128,0.035)_1px,transparent_1px),linear-gradient(180deg,rgba(0,140,128,0.035)_1px,transparent_1px)] bg-[length:auto,auto,44px_44px,44px_44px]" />
      <div className="relative z-10 mx-auto max-w-[1180px] px-4 py-5 sm:px-5 lg:px-6">
        <header className="mb-5 flex flex-col items-start justify-between gap-4 rounded-[16px] border border-[#bfe9e4] bg-[linear-gradient(135deg,#ffffff_0%,#f4fffb_100%)] px-5 py-5 shadow-[0_12px_28px_rgba(0,96,86,0.07)] sm:flex-row sm:items-center">
          <div>
            <div className="inline-flex items-center rounded-full border border-[#bfe5e8] bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#0f766e]">
              Member Command Center
            </div>
            <h1 className="mt-3 text-[28px] font-extrabold leading-none tracking-normal text-[#071a35] sm:text-[30px]">Dashboard</h1>
            <p className="mt-2 text-[13px] font-medium text-[#64748b]">Track your points, tiers, campaigns, and member benefits.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <button
              type="button"
              onClick={openNotifications}
              aria-label="Notifications"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d6eee8] bg-white/70 text-[#081a35] shadow-[0_8px_18px_rgba(0,96,86,0.06)] backdrop-blur transition hover:bg-white hover:shadow-sm"
            >
              <Bell className="h-5 w-5" />
              {notificationCount > 0 ? (
                <span className="absolute right-2 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[#f6f8fb] bg-[#ef3448]" />
              ) : null}
            </button>
            <Link
              to="/customer/profile"
              aria-label="Settings"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d6eee8] bg-white/70 text-[#081a35] shadow-[0_8px_18px_rgba(0,96,86,0.06)] backdrop-blur transition hover:bg-white hover:shadow-sm"
            >
              <Settings className="h-5 w-5" />
            </Link>
          </div>
        </header>

        <nav className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6" aria-label="Customer shortcuts">
          {quickNavItems.map((item) => {
            const QuickIcon = item.icon;
            return (
              <Link
                key={item.href}
                to={item.href}
                className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-[8px] border border-[#cfe9e3] bg-[linear-gradient(180deg,#ffffff_0%,#f5fffb_100%)] px-3 text-[12px] font-extrabold text-[#10213a] shadow-[0_8px_18px_rgba(0,96,86,0.055)] transition hover:border-[#8bd3c8] hover:bg-[#eefbf8] hover:text-[#00736f]"
              >
                <QuickIcon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.45fr_1.08fr]">
          <Card className="relative min-h-[192px] min-w-0 overflow-hidden rounded-[9px] border border-[#d9e3ef] bg-[radial-gradient(circle_at_92%_92%,rgba(0,140,128,0.34),transparent_33%),linear-gradient(135deg,#061d3a_0%,#073b70_100%)] p-5 text-white shadow-[0_14px_28px_rgba(8,26,53,0.16)]">
            <div className="pointer-events-none absolute -bottom-24 -right-20 h-72 w-72 rounded-full border border-white/6" />
            <div className="pointer-events-none absolute -bottom-14 -right-12 h-52 w-52 rounded-full border border-white/6" />
            <div className="relative flex h-full min-h-[152px] flex-col items-center justify-center text-center">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#87e4db]">Member Balance</p>
              <div className="mt-4 flex flex-wrap items-end justify-center gap-3">
                <p className="text-[44px] font-black leading-none tracking-normal sm:text-[50px]">{user.points.toLocaleString()}</p>
                <p className="pb-2 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#bffaf2]">points</p>
              </div>
              <span className="mt-4 inline-flex min-w-[154px] items-center justify-center rounded-full bg-[#d8fff7] px-5 py-2 text-[12px] font-black text-[#005f5a]">
                {derivedTierName} Tier
              </span>
              <p className="mt-4 max-w-[260px] text-[12px] font-semibold leading-5 text-white/90">
                {nextTierData ? `Keep earning to unlock ${nextTierData.name} benefits.` : `${derivedTierName} benefits active.`}
              </p>
            </div>
          </Card>

          <Card className="min-h-[192px] min-w-0 rounded-[9px] border border-[#cfe9e3] bg-[linear-gradient(135deg,#ffffff_0%,#f4fffb_100%)] p-4 shadow-[0_12px_26px_rgba(0,96,86,0.08)]">
            <p className="text-[14px] font-medium text-[#081a35]">Welcome back, {firstName}.</p>
            <div className="mt-4 grid gap-3 sm:h-[132px] sm:grid-cols-3 sm:divide-x sm:divide-[#dfe6ef]">
              {summaryCards.map((item) => {
                const SummaryIcon = item.icon;
                return (
                  <div key={item.title} className="flex min-h-[124px] min-w-0 flex-col items-center justify-center px-2 text-center first:pl-0 last:pr-0 sm:min-h-0">
                    <span
                      className={cn(
                        "inline-flex h-10 w-10 items-center justify-center rounded-full",
                        item.tone === "blue" && "bg-[#e8f3ff] text-[#1967ad] ring-1 ring-[#c5e0ff]",
                        item.tone === "teal" && "bg-[#def5ef] text-[#008b7f]",
                        item.tone === "red" && "bg-[#ffe4ea] text-[#e63f52]",
                      )}
                    >
                      <SummaryIcon className="h-5 w-5" />
                    </span>
                    <p className="mt-3 text-[10px] font-bold uppercase tracking-normal text-[#081a35]">{item.title}</p>
                    <p className="mt-1 text-[22px] font-extrabold leading-none tracking-normal text-[#020817]">{item.value}</p>
                    <p
                      className={cn(
                        "mt-2 max-w-[120px] text-[11px] font-semibold leading-4",
                        item.tone === "blue" && "text-[#526275]",
                        item.tone === "teal" && "text-[#078f6d]",
                        item.tone === "red" && "text-[#e63f52]",
                      )}
                    >
                      {item.detail}
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="grid min-w-0 gap-4">
            <Card className="min-h-[104px] rounded-[9px] border border-[#cfe9e3] bg-[linear-gradient(135deg,#ffffff_0%,#f5fffb_100%)] p-4 shadow-[0_12px_26px_rgba(0,96,86,0.08)]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e5f6f2] text-[#099285]">
                    <Trophy className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-extrabold uppercase tracking-normal text-[#071a35]">Tier Progress</p>
                    <p className="mt-1 text-[11px] font-medium text-[#526275]">
                      {nextTierData ? (
                        <>
                          Next: <span className="font-bold text-[#00877e]">{nextTierData.name}</span>
                        </>
                      ) : (
                        <>
                          Current Tier: <span className="font-bold text-[#00877e]">{derivedTierName}</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e7f8f5] text-[#0b927e] shadow-inner">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
              </div>
              <Progress value={tierProgress} className="mt-4 h-2.5 bg-[#e9eef4]" indicatorClassName="bg-[#07958a]" />
              <div className="mt-3 flex justify-between gap-3 text-[11px] font-extrabold text-[#071a35]">
                <span>{progressCurrent.toLocaleString()} pts</span>
                <span className="text-right">{nextTierData ? `${remainingProgressPoints.toLocaleString()} pts left` : "Benefits Active"}</span>
              </div>
            </Card>

            <Link
              to="/customer/rewards"
              className="group flex min-h-[72px] items-center gap-3 overflow-hidden rounded-[9px] border border-[#aee1d9] bg-[linear-gradient(135deg,#effcf8_0%,#e1f7f1_100%)] px-4 py-3 text-[#071a35] shadow-[0_12px_24px_rgba(0,96,86,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(0,96,86,0.12)]"
            >
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#008c80] shadow-sm">
                <Gift className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold text-[#00736f]">
                  {closestReward && closestRewardNeeded === 0 ? "Closest Reward" : closestReward ? `${closestRewardNeeded.toLocaleString()} pts away` : "Rewards Catalog"}
                </span>
                <span className="mt-0.5 block truncate text-[13px] font-extrabold">
                  {closestReward ? closestReward.name : "Open Rewards Catalog"}
                </span>
                <span className="mt-1 block text-[11px] font-medium text-[#526275]">
                  {closestReward
                    ? closestRewardNeeded === 0
                      ? "You have enough points to redeem."
                      : "Earn more points to unlock it."
                    : "Published rewards will appear here."}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-[#00736f] transition group-hover:translate-x-1" />
            </Link>
          </div>
        </section>

        <Link
          to="/customer/rewards"
          className="mt-4 flex min-h-[66px] items-center justify-between gap-4 rounded-[9px] border border-[#aee1d9] bg-[linear-gradient(135deg,#eefbf8_0%,#f8fffc_100%)] px-5 py-4 text-[#081a35] shadow-[0_10px_22px_rgba(0,96,86,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_26px_rgba(0,96,86,0.1)]"
        >
          <span className="flex min-w-0 items-center gap-4">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#008c80] text-white shadow-[0_10px_18px_rgba(0,140,128,0.18)]">
              <Info className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-extrabold text-[#00736f]">
                {affordableRewards.length > 0 ? "You can redeem pharmacy vouchers now!" : "Keep earning toward your next pharmacy voucher."}
              </span>
              <span className="mt-1 block text-[12px] font-medium text-[#263a55]">
                {affordableRewards.length > 0
                  ? "Explore pharmacy and wellness rewards available to you."
                  : closestReward
                    ? `${closestRewardNeeded.toLocaleString()} more points unlocks ${closestReward.name}.`
                    : "New pharmacy and wellness rewards will appear when the catalog is published."}
              </span>
            </span>
          </span>
          <span className="hidden shrink-0 items-center gap-3 text-[#09a99f] sm:flex">
            <ShoppingBag className="h-8 w-8" />
            <HeartPulse className="h-6 w-6" />
          </span>
        </Link>

        <section className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.98fr_1fr]">
          <Card className="min-h-[342px] min-w-0 overflow-hidden rounded-[9px] border border-[#cfe9e3] bg-[linear-gradient(180deg,#ffffff_0%,#fbfffd_100%)] shadow-[0_12px_26px_rgba(0,96,86,0.08)]">
            <div className="flex items-center justify-between px-5 pb-3 pt-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f0f4f8] text-[#526275]">
                  <ReceiptText className="h-4 w-4" />
                </span>
                <h2 className="truncate text-[13px] font-extrabold uppercase tracking-normal">Recent Transactions</h2>
              </div>
              <Link to="/customer/activity" className="shrink-0 rounded-md px-2 py-1.5 text-[11px] font-bold text-[#075aaa] transition hover:bg-[#eef7ff]">
                View All
              </Link>
            </div>
            <div className="grid grid-cols-[44px_minmax(0,1fr)_82px_64px] gap-2 border-y border-[#e0f1ed] bg-[#f3fbf8] px-5 py-2.5 text-[10px] font-bold text-[#526275]">
              <span>Type</span>
              <span>Description</span>
              <span>Date</span>
              <span className="text-right">Points</span>
            </div>
            <div>
              {recentTransactions.length === 0 ? (
                <div className="px-5 py-10 text-[13px] font-medium text-[#65728a]">No recent transactions found.</div>
              ) : (
                recentTransactions.map((tx) => {
                  const isRedeem = tx.type === "redeemed";
                  const RowIcon = transactionIcon(tx);
                  return (
                    <div
                      key={tx.id}
                      className="grid grid-cols-[44px_minmax(0,1fr)_82px_64px] items-center gap-2 border-b border-[#edf1f5] px-5 py-3 text-[11px] last:border-b-0"
                    >
                      <span
                        className={cn(
                          "inline-flex h-8 w-8 items-center justify-center rounded-full",
                          isRedeem ? "bg-[#ffe0e6] text-[#e63f52]" : "bg-[#dff6ef] text-[#0b927e]",
                        )}
                      >
                        <RowIcon className="h-4 w-4" />
                      </span>
                      <span className="truncate pr-2 font-semibold text-[#081a35]">{normalizeTransactionDescription(tx.description)}</span>
                      <span className="font-medium text-[#65728a]">{formatDate(tx.date)}</span>
                      <span className={cn("text-right font-extrabold", isRedeem ? "text-[#c52634]" : "text-[#0aa06e]")}>
                        {isRedeem ? "-" : "+"}
                        {Math.abs(tx.points).toLocaleString()}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          <Card className="min-h-[342px] min-w-0 rounded-[9px] border border-[#cfe9e3] bg-[linear-gradient(180deg,#ffffff_0%,#fbfffd_100%)] p-5 shadow-[0_12px_26px_rgba(0,96,86,0.08)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Megaphone className="h-4 w-4 shrink-0 text-[#071a35]" />
                <h2 className="truncate text-[13px] font-extrabold uppercase tracking-normal">Active Campaigns</h2>
              </div>
              {activeCampaign ? (
                <Link to="/customer/earn" className="shrink-0 rounded-md px-2 py-1.5 text-[11px] font-bold text-[#075aaa] transition hover:bg-[#eef7ff]">
                  View All
                </Link>
              ) : null}
            </div>

            {activeCampaign ? (
              <div className="mt-7 rounded-[10px] border border-[#d6eee8] bg-[linear-gradient(135deg,#f8fffc_0%,#eefbf8_100%)] p-5 text-center">
                <Badge className="border-0 bg-[#061e3b] text-[10px] text-white hover:bg-[#061e3b]">
                  {activeCampaign.campaignType === "flash_sale" ? "Flash Campaign" : "Bonus Campaign"}
                </Badge>
                <h3 className="mt-4 text-[16px] font-extrabold text-[#081a35]">{activeCampaign.bannerTitle || activeCampaign.campaignName}</h3>
                <p className="mt-2 text-[12px] font-medium leading-5 text-[#65728a]">
                  {activeCampaign.bannerMessage || activeCampaign.description}
                </p>
                <p className="mt-4 text-[11px] font-extrabold text-[#0b806f]">{formatCampaignCountdown(activeCampaign.endsAt, countdownNow)}</p>
                <Link
                  to="/customer/rewards"
                  className="mt-5 inline-flex h-10 min-w-[138px] items-center justify-center rounded-[7px] bg-[linear-gradient(135deg,#008c80,#006d68)] px-5 text-[11px] font-extrabold text-white shadow-[0_12px_22px_rgba(0,140,128,0.18)] transition hover:brightness-105"
                >
                  Open Rewards
                </Link>
              </div>
            ) : (
              <div className="mt-5 flex min-h-[254px] flex-col items-center justify-center rounded-[10px] border border-[#d6eee8] bg-[radial-gradient(circle_at_50%_0%,rgba(0,140,128,0.10),transparent_45%),linear-gradient(135deg,#f8fffc_0%,#eef8f5_100%)] px-6 py-8 text-center">
                <div className="flex h-[86px] w-[86px] items-center justify-center rounded-full bg-[#e0f8f3] text-[#0aa79a]">
                  <Megaphone className="h-11 w-11" />
                </div>
                <p className="mt-5 text-[16px] font-extrabold text-[#081a35]">No Live Campaigns</p>
                <p className="mt-2 max-w-[260px] text-[12px] font-medium leading-5 text-[#65728a]">
                  Check back soon for new ways to earn points.
                </p>
                <Link
                  to="/customer/rewards"
                  className="mt-5 inline-flex h-10 min-w-[138px] items-center justify-center rounded-[7px] bg-[linear-gradient(135deg,#008c80,#006d68)] px-5 text-[11px] font-extrabold text-white shadow-[0_12px_22px_rgba(0,140,128,0.18)] transition hover:brightness-105"
                >
                  Open Rewards
                </Link>
              </div>
            )}
          </Card>

          <Card className="min-h-[342px] min-w-0 rounded-[9px] border border-[#cfe9e3] bg-[linear-gradient(180deg,#ffffff_0%,#fbfffd_100%)] p-5 shadow-[0_12px_26px_rgba(0,96,86,0.08)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#008c80]" />
                <h2 className="truncate text-[13px] font-extrabold uppercase tracking-normal">Tier Benefits</h2>
              </div>
              <Link to="/customer/profile" className="shrink-0 rounded-md px-2 py-1.5 text-[11px] font-bold text-[#075aaa] transition hover:bg-[#eef7ff]">
                View All Benefits
              </Link>
            </div>
            <div className="mt-5 space-y-3">
              {tierBenefitRows.map((benefit) => {
                const BenefitIcon = benefit.icon;
                return (
                  <div key={benefit.title} className="flex min-h-[62px] items-start gap-3 rounded-[8px] border border-[#cbeee9] bg-[#f2fffc] p-3.5">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#dff8f3] text-[#008c80]">
                      <BenefitIcon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12px] font-extrabold text-[#071a35]">{benefit.title}</span>
                      <span className="mt-1 block text-[11px] font-medium leading-4 text-[#526275]">{benefit.body}</span>
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-6 text-center text-[12px] font-semibold text-[#00736f]">
              <CheckCircle2 className="mr-2 inline h-4 w-4 text-[#0b927e]" />
              More {derivedTierName} benefits await you.
            </p>
          </Card>
        </section>
      </div>
    </div>
  );
}
