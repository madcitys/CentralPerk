import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  Clock,
  Megaphone,
  Settings,
  Sparkles,
  Trophy,
  WalletCards,
  Zap,
} from "lucide-react";
import { Link, useOutletContext } from "react-router-dom";
import { Card } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Progress } from "../../../components/ui/progress";
import { cn } from "../../../components/ui/utils";
import type { AppOutletContext } from "../../types/app-context";
import type { PromotionCampaign } from "../../lib/promotions";
import { loadActiveCampaignsViaApi } from "../../lib/api";
import { fetchTierRulesViaService } from "../../lib/points-service-client";
import { normalizeTransactionDescription } from "../../lib/reward-display";

const tierLevels = [
  { name: "Bronze", min: 0 },
  { name: "Silver", min: 250 },
  { name: "Gold", min: 750 },
] as const;

type TierName = (typeof tierLevels)[number]["name"];
type TierRuleRow = {
  tier_label: string;
  min_points: number;
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

export default function Dashboard() {
  const { user, notificationCount = 0, openNotifications } = useOutletContext<AppOutletContext>();
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [tierMinimums, setTierMinimums] = useState<Record<TierName, number>>({
    Bronze: 0,
    Silver: 250,
    Gold: 750,
  });
  const [activeCampaigns, setActiveCampaigns] = useState<PromotionCampaign[]>([]);

  const resolvedTierLevels = useMemo(
    () => tierLevels.map((tier) => ({ ...tier, min: tierMinimums[tier.name] })),
    [tierMinimums],
  );

  const derivedTierName = useMemo<TierName>(() => {
    const level = [...resolvedTierLevels].sort((a, b) => b.min - a.min).find((tier) => user.points >= tier.min);
    return (level?.name ?? "Bronze") as TierName;
  }, [resolvedTierLevels, user.points]);

  const currentTierIndex = Math.max(0, resolvedTierLevels.findIndex((tier) => tier.name === derivedTierName));
  const currentTierData = resolvedTierLevels[currentTierIndex];
  const nextTierData = resolvedTierLevels[currentTierIndex + 1] ?? null;
  const progressBase = currentTierData.min;
  const progressTarget = nextTierData ? nextTierData.min : Math.max(currentTierData.min, user.points);
  const tierProgress =
    nextTierData && progressTarget > progressBase
      ? Math.min(100, ((user.points - progressBase) / (progressTarget - progressBase)) * 100)
      : 100;

  const recentTransactions = useMemo(
    () => [...user.transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5),
    [user.transactions],
  );

  const monthlyEarnCount = useMemo(() => {
    const now = new Date();
    return user.transactions.filter(
      (tx) =>
        tx.type === "earned" &&
        new Date(tx.date).getMonth() === now.getMonth() &&
        new Date(tx.date).getFullYear() === now.getFullYear(),
    ).length;
  }, [user.transactions]);

  const monthlyRedeemCount = useMemo(() => {
    const now = new Date();
    return user.transactions.filter(
      (tx) =>
        tx.type === "redeemed" &&
        new Date(tx.date).getMonth() === now.getMonth() &&
        new Date(tx.date).getFullYear() === now.getFullYear(),
    ).length;
  }, [user.transactions]);

  const tierBenefits: Record<TierName, string[]> = {
    Bronze: [
      "Earn base points on every qualifying purchase.",
      "See starter-only campaigns and reminders.",
      "Track the exact points needed to reach Silver.",
    ],
    Silver: [
      "Unlock stronger bonus campaigns and survey rewards.",
      "Get earlier access to selected reward drops.",
      "Keep better redemption value with partner offers.",
    ],
    Gold: [
      "Receive premium campaign access and high-value recovery offers.",
      "See top reward opportunities before lower tiers.",
      "Enjoy faster support and exclusive member perks.",
    ],
  };

  useEffect(() => {
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void fetchTierRulesViaService()
      .then((response) => {
        const nextMinimums: Record<TierName, number> = { Bronze: 0, Silver: 250, Gold: 750 };
        for (const rule of response?.tiers ?? ([] as TierRuleRow[])) {
          const label = String(rule.tier_label).toLowerCase();
          if (label === "bronze") nextMinimums.Bronze = Math.max(0, Number(rule.min_points) || 0);
          if (label === "silver") nextMinimums.Silver = Math.max(0, Number(rule.min_points) || 0);
          if (label === "gold") nextMinimums.Gold = Math.max(0, Number(rule.min_points) || 0);
        }
        setTierMinimums(nextMinimums);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void loadActiveCampaignsViaApi(user.tier)
      .then((response) => setActiveCampaigns(response.campaigns))
      .catch(() => setActiveCampaigns([]));
  }, [user.tier]);

  const projectedBalance = user.points + user.pendingPoints;
  const activeCampaign = activeCampaigns[0] ?? null;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f5f7fa] text-[#081a35]">
      <div className="mx-auto max-w-[1500px] px-5 py-6 sm:px-6">
        <header className="mb-5 flex items-center justify-between gap-6 rounded-[22px] border border-[#dfe7f0] bg-white px-6 py-4 shadow-[0_14px_30px_rgba(8,26,53,0.06)]">
          <div>
            <p className="w-fit rounded-full border border-[#9ddbd4] bg-[#eefbf8] px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#007f78]">
              Member Command Center
            </p>
            <h1 className="mt-3 text-[30px] font-black leading-tight tracking-tight text-[#081a35]">Dashboard</h1>
            <p className="mt-2 text-[15px] font-medium text-[#65728a]">
              Welcome back, {user.fullName.split(" ")[0]}. Track your points, tiers, campaigns, and member benefits.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openNotifications}
              aria-label="Notifications"
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#e6ebf2] bg-white text-[#081a35] shadow-[0_8px_24px_rgba(8,26,53,0.06)]"
            >
              <Bell className="h-5 w-5" />
              {notificationCount > 0 ? (
                <span className="absolute right-2 top-2 h-4 min-w-4 rounded-full bg-[#ef1f2f] px-1 text-center text-[9px] font-black leading-4 text-white">
                  {Math.min(notificationCount, 9)}
                </span>
              ) : null}
            </button>
            <Link
              to="/customer/profile"
              aria-label="Settings"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#e6ebf2] bg-white text-[#081a35] shadow-[0_8px_24px_rgba(8,26,53,0.06)]"
            >
              <Settings className="h-5 w-5" />
            </Link>
          </div>
        </header>

        <section className="grid gap-4 min-[1460px]:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)_minmax(0,1.18fr)]">
          <Card className="relative min-h-[252px] min-w-0 gap-0 overflow-hidden rounded-[20px] border border-[#dfe6f0] bg-[#061e3b] p-6 text-white shadow-[0_16px_32px_rgba(8,26,53,0.12)]">
            <div className="pointer-events-none absolute -bottom-20 -right-16 h-56 w-56 rounded-full border border-[#0b8a99]/30" />
            <div className="pointer-events-none absolute -bottom-24 -right-20 h-72 w-72 rounded-full border border-[#0b8a99]/25" />
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-black uppercase tracking-[0.22em] text-white/72">Member Balance</p>
              <span className="rounded-full bg-[#f7b719] px-4 py-1.5 text-[11px] font-black text-white">{derivedTierName} Tier</span>
            </div>
            <div className="mt-7 flex items-end gap-3">
              <p className="text-[54px] font-black leading-none tracking-tight">{user.points.toLocaleString()}</p>
              <p className="pb-2 text-[13px] font-black uppercase tracking-[0.14em] text-white/82">points</p>
            </div>
            <p className="mt-5 max-w-[260px] text-[13px] font-semibold leading-5 text-white/88">
              You are currently in {derivedTierName}. Keep your momentum high with quick actions and active campaigns.
            </p>
            <div className="mt-7 grid grid-cols-2 gap-4">
              <Link
                to="/customer/rewards"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white text-[13px] font-black text-[#081a35] shadow-sm transition hover:bg-[#f4f6f8]"
              >
                <WalletCards className="h-4 w-4" />
                Redeem
              </Link>
              <Link
                to="/customer/earn"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/28 bg-white/0 text-[13px] font-black text-white transition hover:bg-white/10"
              >
                <Zap className="h-4 w-4" />
                Earn Points
              </Link>
            </div>
          </Card>

          <Card className="min-h-[252px] min-w-0 gap-0 rounded-[20px] border border-[#e4eaf2] bg-white p-6 shadow-[0_16px_32px_rgba(8,26,53,0.08)]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[12px] font-black uppercase tracking-[0.22em] text-[#66758b]">Tier Progress</p>
                <h2 className="mt-7 text-[21px] font-black leading-tight text-[#081a35]">
                  {nextTierData ? `${Math.max(nextTierData.min - user.points, 0).toLocaleString()} pts to ${nextTierData.name}` : "Maximum tier reached"}
                </h2>
                <p className="mt-2 text-[13px] font-medium text-[#65728a]">
                  {nextTierData ? "You are approaching the next benefit band." : "You are enjoying the best benefits."}
                </p>
              </div>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f3f7fb] text-[#081a35]">
                <Trophy className="h-5 w-5" />
              </span>
            </div>
            <Progress value={tierProgress} className="mt-8 h-2.5 bg-[#e9eef4] [&>div]:bg-[#0b927e]" />
            <div className="mt-5 flex justify-between text-[12px] font-medium text-[#65728a]">
              <span>{user.points.toLocaleString()} pts</span>
              <span>{progressTarget.toLocaleString()} pts max</span>
            </div>
            <div className="mt-7 inline-flex items-center gap-2 rounded-lg bg-[#e4f6ef] px-4 py-3 text-[12px] font-black text-[#0b806f]">
              <CheckCircle2 className="h-4 w-4" />
              {derivedTierName} Tier Benefits Unlocked
            </div>
          </Card>

          <Card className="grid min-h-[252px] min-w-0 grid-cols-2 gap-0 overflow-hidden rounded-[20px] border border-[#e4eaf2] bg-white p-0 shadow-[0_16px_32px_rgba(8,26,53,0.08)]">
            <div className="border-b border-r border-[#edf1f5] p-5">
              <div className="flex items-start justify-between">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#66758b]">Pending Points</p>
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#eaf3ff] text-[#3b82f6]">
                  <Clock className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-4 text-[26px] font-black leading-none">{user.pendingPoints.toLocaleString()}</p>
              <p className="mt-3 text-[12px] font-medium leading-5 text-[#65728a]">processing transactions</p>
            </div>
            <div className="border-b border-[#edf1f5] p-5">
              <div className="flex items-start justify-between">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#66758b]">Earned This Month</p>
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#e5f6ef] text-[#0aa06e]">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-4 text-[26px] font-black leading-none">{user.earnedThisMonth.toLocaleString()}</p>
              <p className="mt-3 text-[12px] font-medium text-[#65728a]">points</p>
              <p className="mt-3 text-[12px] font-black text-[#079060]">{monthlyEarnCount} earning transactions</p>
            </div>
            <div className="border-r border-[#edf1f5] p-5">
              <div className="flex items-start justify-between">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#66758b]">Redeemed This Month</p>
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#ffecec] text-[#ef4250]">
                  <ArrowDownRight className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-4 text-[26px] font-black leading-none">{user.redeemedThisMonth.toLocaleString()}</p>
              <p className="mt-3 text-[12px] font-medium text-[#65728a]">points</p>
              <p className="mt-3 text-[12px] font-black text-[#ef1f2f]">{monthlyRedeemCount} redemption actions</p>
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#66758b]">Projected Balance</p>
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#e5f6ef] text-[#0b927e]">
                  <WalletCards className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-4 text-[26px] font-black leading-none">{projectedBalance.toLocaleString()}</p>
              <p className="mt-3 text-[12px] font-medium text-[#65728a]">pts</p>
            </div>
          </Card>
        </section>

        <section className="mt-4 grid gap-4 min-[1460px]:grid-cols-[minmax(0,1.38fr)_minmax(0,0.92fr)_minmax(0,0.82fr)]">
          <Card className="min-h-[302px] min-w-0 gap-0 rounded-[20px] border border-[#e4eaf2] bg-white p-0 shadow-[0_16px_32px_rgba(8,26,53,0.08)]">
            <div className="flex items-center justify-between px-6 pb-4 pt-6">
              <h2 className="text-[16px] font-black">Recent Transactions</h2>
              <Link
                to="/customer/activity"
                className="rounded-lg border border-[#e3e8ef] bg-white px-4 py-2 text-[12px] font-black text-[#081a35]"
              >
                View All
              </Link>
            </div>
            <div className="grid grid-cols-[96px_minmax(0,1fr)_100px_72px] gap-3 border-b border-[#edf1f5] px-6 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-[#66758b]">
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
                  return (
                    <div
                      key={tx.id}
                      className="grid grid-cols-[96px_minmax(0,1fr)_100px_72px] items-center gap-3 border-b border-[#edf1f5] px-6 py-3.5 text-[12px] last:border-b-0"
                    >
                      <span className={cn("flex items-center gap-2 font-black uppercase", isRedeem ? "text-[#ef1f2f]" : "text-[#0aa06e]")}>
                        <span
                          className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded-full",
                            isRedeem ? "bg-[#ffecec]" : "bg-[#e5f6ef]",
                          )}
                        >
                          {isRedeem ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                        </span>
                        {isRedeem ? "Redeem" : "Earn"}
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

          <Card className="min-h-[302px] min-w-0 gap-0 rounded-[20px] border border-[#e4eaf2] bg-white p-5 shadow-[0_16px_32px_rgba(8,26,53,0.08)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-black">Active Campaigns</h2>
              <Badge className="border-0 bg-[#e4f6ef] px-3 py-1 text-[10px] font-black text-[#0b806f]">Live Promotions</Badge>
            </div>

            {activeCampaign ? (
              <div className="mt-5 rounded-xl border border-[#edf1f5] bg-[#f9fbfc] p-5">
                <Badge className="border-0 bg-[#061e3b] text-white">
                  {activeCampaign.campaignType === "flash_sale" ? "Flash Campaign" : "Bonus Campaign"}
                </Badge>
                <h3 className="mt-4 text-lg font-black text-[#081a35]">{activeCampaign.bannerTitle || activeCampaign.campaignName}</h3>
                <p className="mt-2 text-[13px] font-medium leading-5 text-[#65728a]">
                  {activeCampaign.bannerMessage || activeCampaign.description}
                </p>
                <p className="mt-4 text-[12px] font-black text-[#0b806f]">{formatCampaignCountdown(activeCampaign.endsAt, countdownNow)}</p>
                <Link
                  to="/customer/rewards"
                  className="mt-6 inline-flex h-12 min-w-[164px] items-center justify-center rounded-xl bg-[linear-gradient(135deg,#008c80,#006d68)] px-5 text-[12px] font-black text-white shadow-[0_12px_22px_rgba(0,140,128,0.18)] transition hover:brightness-105"
                >
                  Open Rewards
                </Link>
              </div>
            ) : (
              <div className="mt-4 flex min-h-[226px] flex-col items-center rounded-[18px] bg-[linear-gradient(180deg,#f5fbfb_0%,#eef5f4_100%)] px-7 py-6 text-center">
                <div className="flex flex-1 flex-col items-center justify-center">
                  <div className="relative">
                    <span className="absolute -left-8 top-2 text-[#7ccfbd]">
                      <Sparkles className="h-5 w-5" />
                    </span>
                    <span className="absolute -right-8 top-10 text-[#7ccfbd]">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <Megaphone className="h-14 w-14 text-[#11a98e]" />
                  </div>
                  <p className="mt-4 text-[14px] font-black text-[#081a35]">No active campaigns are live right now.</p>
                  <p className="mt-2 max-w-[230px] text-[12px] font-medium leading-5 text-[#65728a]">
                    Check back later for exciting ways to earn more points!
                  </p>
                </div>
                <Link
                  to="/customer/rewards"
                  className="mt-5 inline-flex h-12 min-w-[176px] items-center justify-center rounded-xl bg-[linear-gradient(135deg,#008c80,#006d68)] px-5 text-[12px] font-black text-white shadow-[0_12px_22px_rgba(0,140,128,0.18)] transition hover:brightness-105"
                >
                  Open Rewards
                </Link>
              </div>
            )}
          </Card>

          <Card className="min-h-[302px] min-w-0 gap-0 rounded-[20px] border border-[#e4eaf2] bg-white p-5 shadow-[0_16px_32px_rgba(8,26,53,0.08)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-black">Tier Benefits</h2>
                <p className="mt-2 text-[12px] font-medium text-[#65728a]">Benefits for your current tier</p>
              </div>
              <Badge className="border-0 bg-[#fff0d7] px-3 py-1 text-[11px] font-black text-[#d18a00]">{derivedTierName} Tier</Badge>
            </div>
            <div className="mt-4 space-y-3">
              {tierBenefits[derivedTierName].map((benefit) => (
                <div key={benefit} className="flex min-h-[54px] items-start gap-3 rounded-lg border border-[#e4eaf2] bg-white p-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e8f7f3] text-[#0b927e]">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <p className="text-[12px] font-bold leading-5 text-[#081a35]">{benefit}</p>
                </div>
              ))}
            </div>
            <Link
              to="/customer/profile"
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-[#e4eaf2] text-[12px] font-black text-[#081a35]"
            >
              View All Benefits
              <ArrowRight className="h-4 w-4" />
            </Link>
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
