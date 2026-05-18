import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  Crown,
  Gift,
  HeartPulse,
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
  if (transactionCount > 0) return `${transactionCount} ${noun}`;
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
  }, [resolvedTierLevels, user.points]);

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
    () => rewards.filter((reward) => reward.available && Number(reward.pointsCost) > 0).sort((a, b) => a.pointsCost - b.pointsCost),
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
          : "Member service perks stay attached to your current tier.",
    },
    {
      icon: HeartPulse,
      title: "Wellness Perks",
      body:
        availableRewards.length > 0
          ? `${affordableRewards.length.toLocaleString()} reward${affordableRewards.length === 1 ? "" : "s"} redeemable with your balance.`
          : "Wellness rewards will appear when the catalog is published.",
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
    void loadActiveCampaignsViaApi(user.tier)
      .then((response) => setActiveCampaigns(response.campaigns))
      .catch(() => setActiveCampaigns([]));
  }, [user.tier]);

  useEffect(() => {
    void loadRewardsViaApi()
      .then((response) => setRewards(response.rewards))
      .catch(() => setRewards([]));
  }, []);

  const activeCampaign = activeCampaigns[0] ?? null;
  const firstName = user.fullName.split(" ").filter(Boolean)[0] ?? user.fullName;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f6f8fb] text-[#081a35]">
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-5 lg:px-6">
        <header className="mb-5 flex items-start justify-between gap-5">
          <div>
            <p className="w-fit rounded-full border border-[#9ddbd4] bg-[#eefbf8] px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#007f78]">
              Member Command Center
            </p>
            <h1 className="mt-3 text-[38px] font-black leading-none tracking-tight text-[#071a35] sm:text-[42px]">Dashboard</h1>
            <p className="mt-3 text-[15px] font-medium text-[#526275]">
              Welcome back, {firstName}. Thank you for being a valued Greenovate member.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <button
              type="button"
              onClick={openNotifications}
              aria-label="Notifications"
              className="relative inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#e4eaf2] bg-white text-[#071a35] shadow-[0_12px_24px_rgba(8,26,53,0.09)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(8,26,53,0.12)]"
            >
              <Bell className="h-5 w-5" />
              {notificationCount > 0 ? (
                <span className="absolute right-2.5 top-2.5 h-4 min-w-4 rounded-full bg-[#00a99d] px-1 text-center text-[9px] font-black leading-4 text-white">
                  {Math.min(notificationCount, 9)}
                </span>
              ) : null}
            </button>
            <Link
              to="/customer/profile"
              aria-label="Settings"
              className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#e4eaf2] bg-white text-[#071a35] shadow-[0_12px_24px_rgba(8,26,53,0.09)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(8,26,53,0.12)]"
            >
              <Settings className="h-5 w-5" />
            </Link>
          </div>
        </header>

        <section className="grid gap-4 min-[1440px]:grid-cols-[0.98fr_1fr_1.25fr]">
          <Card className="relative min-h-[288px] min-w-0 overflow-hidden rounded-[14px] border border-[#d7e2ef] bg-[radial-gradient(circle_at_88%_92%,rgba(8,105,134,0.34),transparent_32%),linear-gradient(135deg,#051a35_0%,#07396d_100%)] p-6 text-white shadow-[0_18px_34px_rgba(8,26,53,0.16)]">
            <div className="pointer-events-none absolute -bottom-24 -right-20 h-72 w-72 rounded-full border border-white/5" />
            <div className="pointer-events-none absolute -bottom-14 -right-12 h-52 w-52 rounded-full border border-white/5" />
            <div className="grid items-center gap-5 sm:grid-cols-[112px_minmax(0,1fr)]">
              <div className="relative mx-auto flex h-[112px] w-[112px] items-center justify-center">
                <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle,#ffefb5_0%,#f7b719_50%,#bb7800_100%)] shadow-[0_0_28px_rgba(247,183,25,0.55)]" />
                <span className="absolute inset-3 rounded-full border-[7px] border-[#fff0ba]/70" />
                <span className="absolute inset-[22px] flex items-center justify-center rounded-full bg-[linear-gradient(145deg,#d99500,#fff0b3)] text-[#7b4d00] shadow-inner">
                  <Crown className="h-10 w-10 fill-current" />
                </span>
                <Sparkles className="absolute -right-1 top-2 h-4 w-4 text-[#ffe28a]" />
                <Sparkles className="absolute left-3 top-0 h-3.5 w-3.5 text-[#ffe28a]" />
              </div>
              <div className="min-w-0 text-center sm:text-left">
                <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#76ddd4]">Available Points</p>
                <div className="mt-3 flex flex-wrap items-end justify-center gap-2 sm:justify-start">
                  <p className="text-[44px] font-black leading-none tracking-tight 2xl:text-[52px]">{user.points.toLocaleString()}</p>
                  <p className="pb-1 text-[14px] font-black text-[#76ddd4]">points</p>
                </div>
                <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#ffd176] px-4 py-1.5 text-[13px] font-black text-[#664000]">
                  <Crown className="h-4 w-4 fill-current" />
                  {derivedTierName} Tier
                </span>
              </div>
            </div>
            <p className="mx-auto mt-6 max-w-[360px] text-center text-[14px] font-semibold leading-6 text-white/92">
              {nextTierData
                ? `You are in ${derivedTierName}. Keep earning to unlock ${nextTierData.name} benefits.`
                : `${derivedTierName} benefits active. Keep earning and redeeming with your current perks.`}
            </p>
            <div className="mt-6 flex justify-center">
              <Link
                to="/customer/earn"
                className="inline-flex h-11 min-w-[210px] items-center justify-center gap-3 rounded-full bg-[linear-gradient(135deg,#00aaa0,#00857e)] px-6 text-[14px] font-black text-white shadow-[0_18px_28px_rgba(0,169,157,0.28)] transition hover:-translate-y-0.5 hover:brightness-105"
              >
                <ArrowUpRight className="h-5 w-5" />
                Earn More Points
              </Link>
            </div>
          </Card>

          <Card className="min-h-[288px] min-w-0 rounded-[14px] border border-[#e3eaf2] bg-white p-6 shadow-[0_14px_28px_rgba(8,26,53,0.08)]">
            <div className="flex items-start justify-between">
              <div className="flex gap-4">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e6f7f3] text-[#0a9587]">
                  <Trophy className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-[16px] font-black uppercase tracking-[0.05em] text-[#071a35]">Tier Progress</p>
                  <p className="mt-2 text-[14px] font-medium text-[#526275]">
                    {nextTierData ? (
                      <>
                        Next Tier: <span className="font-black text-[#00877e]">{nextTierData.name}</span> at {progressTarget.toLocaleString()} pts
                      </>
                    ) : (
                      <>
                        Current Tier: <span className="font-black text-[#00877e]">{derivedTierName}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#f3f5f8] text-[#9aa4b2] shadow-inner">
                <Crown className="h-5 w-5" />
              </span>
            </div>
            <Progress value={tierProgress} className="mt-8 h-3 bg-[#e9eef4]" indicatorClassName="bg-[#07958a]" />
            <div className="mt-5 flex justify-between gap-4 text-[16px] font-black text-[#071a35]">
              <span>{progressCurrent.toLocaleString()} pts</span>
              <span className="text-right">{nextTierData ? `${progressTarget.toLocaleString()} pts` : `${derivedTierName} active`}</span>
            </div>
            <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-[14px] font-medium text-[#526275]">
              <div>
                Current: <span className="font-black text-[#071a35]">{progressCurrent.toLocaleString()} pts</span>
              </div>
              <div className="h-8 w-px bg-[#dce5ef]" />
              <div>
                {nextTierData ? "Goal" : "Status"}:{" "}
                <span className="font-black text-[#071a35]">{nextTierData ? `${progressTarget.toLocaleString()} pts` : "Benefits active"}</span>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-center gap-3 rounded-[10px] bg-[#e8f7f3] px-5 py-3.5 text-[14px] font-black text-[#078176]">
              <CheckCircle2 className="h-4 w-4" />
              {nextTierData ? `${remainingProgressPoints.toLocaleString()} pts to ${nextTierData.name}` : "Top tier benefits active"}
            </div>
            <p className="mt-5 text-center text-[14px] font-black text-[#0b8f82]">
              <Sparkles className="mr-2 inline h-4 w-4 fill-current text-[#f3b12b]" />
              {derivedTierName} benefits active
            </p>
          </Card>

          <div className="grid min-w-0 gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="min-h-[136px] min-w-0 rounded-[14px] border border-[#e3eaf2] bg-white p-4 text-center shadow-[0_14px_28px_rgba(8,26,53,0.08)]">
                <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#eaf4ff] text-[#246fb6] ring-1 ring-[#c4e0ff]">
                  <Clock className="h-6 w-6" />
                </span>
                <p className="mt-3 text-[12px] font-black leading-4 text-[#071a35]">Pending Points</p>
                <p className="mt-2 whitespace-nowrap text-[24px] font-black leading-none">{user.pendingPoints.toLocaleString()} pts</p>
                <p className="mt-3 text-[11px] font-medium leading-4 text-[#526275]">
                  {user.pendingPoints > 0 ? "Transactions processing" : "No pending transactions"}
                </p>
              </Card>
              <Card className="min-h-[136px] min-w-0 rounded-[14px] border border-[#e3eaf2] bg-white p-4 text-center shadow-[0_14px_28px_rgba(8,26,53,0.08)]">
                <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#dff6ef] text-[#008b7f]">
                  <ArrowUpRight className="h-6 w-6" />
                </span>
                <p className="mt-3 text-[12px] font-black leading-4 text-[#071a35]">Earned This Month</p>
                <p className="mt-2 whitespace-nowrap text-[24px] font-black leading-none">{user.earnedThisMonth.toLocaleString()} pts</p>
                <p className="mt-3 text-[11px] font-black leading-4 text-[#078f6d]">
                  {trendLabel(user.earnedThisMonth, previousMonthSummary.earned, currentMonthSummary.earnCount, "earning transactions")}
                </p>
              </Card>
              <Card className="min-h-[136px] min-w-0 rounded-[14px] border border-[#e3eaf2] bg-white p-4 text-center shadow-[0_14px_28px_rgba(8,26,53,0.08)]">
                <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#ffe5e9] text-[#e63f52]">
                  <ArrowDownRight className="h-6 w-6" />
                </span>
                <p className="mt-3 text-[12px] font-black leading-4 text-[#071a35]">Redeemed This Month</p>
                <p className="mt-2 whitespace-nowrap text-[24px] font-black leading-none">{user.redeemedThisMonth.toLocaleString()} pts</p>
                <p className="mt-3 text-[11px] font-black leading-4 text-[#e63f52]">
                  {trendLabel(user.redeemedThisMonth, previousMonthSummary.redeemed, currentMonthSummary.redeemCount, "redemption transactions")}
                </p>
              </Card>
            </div>

            <Link
              to="/customer/rewards"
              className="group flex min-h-[112px] items-center gap-4 overflow-hidden rounded-[14px] border border-[#f1ddba] bg-[#fff7e9] px-5 py-4 text-[#071a35] shadow-[0_14px_28px_rgba(8,26,53,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(8,26,53,0.11)]"
            >
              <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-[#c98304] shadow-sm">
                <Gift className="h-8 w-8" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-black text-[#bd7d05]">
                  {closestReward && closestRewardNeeded === 0 ? "Closest Reward" : closestReward ? `${closestRewardNeeded.toLocaleString()} pts away` : "Rewards Catalog"}
                </span>
                <span className="mt-1 block truncate text-[16px] font-black">
                  {closestReward ? `${closestReward.name}${closestRewardNeeded === 0 ? " available now" : ""}` : "Open rewards catalog"}
                </span>
                <span className="mt-2 block text-[13px] font-medium text-[#526275]">
                  {closestReward
                    ? closestRewardNeeded === 0
                      ? "You have enough points to redeem."
                      : "Earn a little more to unlock this reward."
                    : "Published rewards will appear here automatically."}
                </span>
              </span>
              <ChevronRight className="h-7 w-7 shrink-0 text-[#8b6a34] transition group-hover:translate-x-1" />
            </Link>
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-[13px] border border-[#b9dce5] bg-[#f1f9ff] px-6 py-5 shadow-[0_12px_28px_rgba(8,26,53,0.05)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#075aaa] text-white">
                <Info className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-[20px] font-black text-[#075aaa]">
                  {affordableRewards.length > 0 ? "You can redeem pharmacy vouchers now!" : "Keep earning toward your next pharmacy voucher."}
                </h2>
                <p className="mt-1 text-[16px] font-medium text-[#263a55]">
                  {affordableRewards.length > 0
                    ? "Explore pharmacy and wellness rewards available to you."
                    : closestReward
                      ? `${closestRewardNeeded.toLocaleString()} more points unlocks ${closestReward.name}.`
                      : "New pharmacy and wellness rewards will appear when the catalog is published."}
                </p>
              </div>
            </div>
            <div className="hidden shrink-0 items-center gap-3 pr-3 text-[#09a99f] lg:flex">
              <ShoppingBag className="h-12 w-12" />
              <HeartPulse className="h-8 w-8" />
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 min-[1440px]:grid-cols-[1.15fr_0.98fr_1fr]">
          <Card className="min-h-[338px] min-w-0 rounded-[14px] border border-[#e3eaf2] bg-white p-0 shadow-[0_14px_28px_rgba(8,26,53,0.08)]">
            <div className="flex items-center justify-between px-6 pb-4 pt-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f0f4f8] text-[#526275]">
                  <ReceiptText className="h-5 w-5" />
                </span>
                <h2 className="text-[16px] font-black uppercase tracking-[0.06em]">Recent Transactions</h2>
              </div>
              <Link
                to="/customer/activity"
                className="rounded-lg px-3 py-2 text-[13px] font-bold text-[#075aaa] transition hover:bg-[#eef7ff]"
              >
                View All
              </Link>
            </div>
            <div className="grid grid-cols-[56px_minmax(0,1fr)_112px_86px] gap-3 border-y border-[#edf1f5] bg-[#fafbfd] px-6 py-3 text-[12px] font-black text-[#526275]">
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
                      className="grid grid-cols-[56px_minmax(0,1fr)_112px_86px] items-center gap-3 border-b border-[#edf1f5] px-6 py-3.5 text-[13px] last:border-b-0"
                    >
                      <span
                        className={cn(
                          "inline-flex h-9 w-9 items-center justify-center rounded-full",
                          isRedeem ? "bg-[#ffe0e6] text-[#e63f52]" : "bg-[#dff6ef] text-[#0b927e]",
                        )}
                      >
                        <RowIcon className="h-5 w-5" />
                      </span>
                      <span className="truncate pr-3 font-bold text-[#081a35]">{normalizeTransactionDescription(tx.description)}</span>
                      <span className="font-medium text-[#65728a]">{formatDate(tx.date)}</span>
                      <span className={cn("text-right font-black", isRedeem ? "text-[#ef1f2f]" : "text-[#0aa06e]")}>
                        {isRedeem ? "-" : "+"}
                        {Math.abs(tx.points).toLocaleString()}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          <Card className="min-h-[338px] min-w-0 rounded-[14px] border border-[#e3eaf2] bg-white p-6 shadow-[0_14px_28px_rgba(8,26,53,0.08)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Megaphone className="h-5 w-5 text-[#071a35]" />
                <h2 className="text-[16px] font-black uppercase tracking-[0.06em]">Active Campaigns</h2>
              </div>
              {activeCampaign ? (
                <Link to="/customer/earn" className="text-[13px] font-bold text-[#075aaa] transition hover:text-[#00877e]">
                  View All
                </Link>
              ) : null}
            </div>

            {activeCampaign ? (
              <div className="mt-5 rounded-xl border border-[#edf1f5] bg-[#f9fbfc] p-5 text-center">
                <Badge className="border-0 bg-[#061e3b] text-white hover:bg-[#061e3b]">
                  {activeCampaign.campaignType === "flash_sale" ? "Flash Campaign" : "Bonus Campaign"}
                </Badge>
                <h3 className="mt-4 text-lg font-black text-[#081a35]">{activeCampaign.bannerTitle || activeCampaign.campaignName}</h3>
                <p className="mt-2 text-[13px] font-medium leading-5 text-[#65728a]">
                  {activeCampaign.bannerMessage || activeCampaign.description}
                </p>
                <p className="mt-4 text-[12px] font-black text-[#0b806f]">{formatCampaignCountdown(activeCampaign.endsAt, countdownNow)}</p>
                <Link
                  to="/customer/rewards"
                  className="mt-6 inline-flex h-11 min-w-[164px] items-center justify-center rounded-lg bg-[linear-gradient(135deg,#008c80,#006d68)] px-5 text-[12px] font-black text-white shadow-[0_12px_22px_rgba(0,140,128,0.18)] transition hover:brightness-105"
                >
                  Open Rewards
                </Link>
              </div>
            ) : (
              <div className="mt-4 flex min-h-[252px] flex-col items-center rounded-[18px] px-7 py-6 text-center">
                <div className="flex flex-1 flex-col items-center justify-center">
                  <div className="relative flex h-[104px] w-[104px] items-center justify-center rounded-full bg-[#edf3fa] text-[#9fb0c5]">
                    <Megaphone className="h-14 w-14" />
                  </div>
                  <p className="mt-5 text-[18px] font-black text-[#081a35]">No live campaigns right now</p>
                  <p className="mt-2 max-w-[280px] text-[15px] font-medium leading-6 text-[#65728a]">
                    Check back soon for new ways to earn points and rewards.
                  </p>
                </div>
              </div>
            )}
          </Card>

          <Card className="min-h-[338px] min-w-0 rounded-[14px] border border-[#e3eaf2] bg-white p-6 shadow-[0_14px_28px_rgba(8,26,53,0.08)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Crown className="h-5 w-5 fill-current text-[#c88b13]" />
                <h2 className="text-[16px] font-black uppercase tracking-[0.06em]">Tier Benefits</h2>
              </div>
              <Link to="/customer/profile" className="text-[13px] font-bold text-[#075aaa] transition hover:text-[#00877e]">
                View All Benefits
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {tierBenefitRows.map((benefit) => {
                const BenefitIcon = benefit.icon;
                return (
                  <div key={benefit.title} className="flex min-h-[64px] items-start gap-4 rounded-[10px] border border-[#f1eadc] bg-[#fffaf2] p-4">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fff0ce] text-[#c8860c]">
                      <BenefitIcon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-black text-[#071a35]">{benefit.title}</span>
                      <span className="mt-1 block text-[13px] font-medium leading-5 text-[#526275]">{benefit.body}</span>
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-5 text-center text-[14px] font-semibold text-[#8b6b2d]">
              <Sparkles className="mr-2 inline h-4 w-4 fill-current text-[#f2b233]" />
              More {derivedTierName} benefits await you.
            </p>
          </Card>
        </section>

        <div className="mt-8 flex items-center gap-4 text-center text-[11px] font-medium text-[#9aa5b4]">
          <div className="h-px flex-1 bg-[#e6ebf2]" />
          <p>Keep engaging to unlock more rewards and exclusive benefits.</p>
          <div className="h-px flex-1 bg-[#e6ebf2]" />
        </div>
      </div>
    </div>
  );
}
