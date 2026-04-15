import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ArrowDownRight, Clock, Award, Shield, Medal, Trophy, Activity, Sparkles, ChevronDown, ChevronUp, Zap, WalletCards, ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useOutletContext } from "react-router-dom";
import { Card } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Progress } from "../../../components/ui/progress";
import { cn } from "../../../components/ui/utils";
import type { AppOutletContext } from "../../types/app-context";
import { supabase } from "../../../utils/supabase/client";
import { getChallengeProgress, loadEngagementState } from "../../lib/member-engagement";
import { loadActivePromotionCampaigns, type PromotionCampaign } from "../../lib/promotions";
import {
  brandNavyBadgeClass,
  brandTealBadgeClass,
  brandTealSolidClass,
  infoPillClass,
  infoSurfaceClass,
  infoTextStrongClass,
  purplePillClass,
} from "../../lib/ui-color-tokens";
import {
  customerEyebrowClass,
  customerPageDescriptionClass,
  customerPageHeroClass,
  customerPageHeroInnerClass,
  customerPanelClass,
  customerPanelSoftClass,
  customerPageTitleClass,
} from "../lib/page-theme";

const tierLevels = [
  { name: "Bronze", min: 0, icon: Shield },
  { name: "Silver", min: 250, icon: Medal },
  { name: "Gold", min: 750, icon: Trophy },
] as const;

type TierName = (typeof tierLevels)[number]["name"];
type TierRuleRow = {
  id: number;
  tier_label: string;
  min_points: number;
  is_active: boolean;
};

const WELCOME_NOTICE_STORAGE_KEY = "centralperk-welcome-notice";

function formatCampaignCountdown(endsAt: string, nowMs: number) {
  const diff = new Date(endsAt).getTime() - nowMs;
  if (Number.isNaN(diff)) return "Schedule unavailable";
  if (diff <= 0) return "Expired";

  const totalMinutes = Math.floor(diff / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${Math.max(minutes, 1)}m left`;
}

export default function Dashboard() {
  const { user } = useOutletContext<AppOutletContext>();
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [tierMinimums, setTierMinimums] = useState<Record<TierName, number>>({
    Bronze: 0,
    Silver: 250,
    Gold: 750,
  });

  const resolvedTierLevels = useMemo(
    () =>
      tierLevels.map((tier) => ({
        ...tier,
        min: tierMinimums[tier.name],
      })),
    [tierMinimums]
  );

  const derivedTierName = useMemo<TierName>(() => {
    const level = [...resolvedTierLevels]
      .sort((a, b) => b.min - a.min)
      .find((tier) => user.points >= tier.min);
    return (level?.name ?? "Bronze") as TierName;
  }, [resolvedTierLevels, user.points]);

  const [selectedTier, setSelectedTier] = useState<TierName>(derivedTierName);
  const [activeCampaigns, setActiveCampaigns] = useState<PromotionCampaign[]>([]);
  const [activeCampaignIndex, setActiveCampaignIndex] = useState(0);
  const [benefitsExpanded, setBenefitsExpanded] = useState(true);

  const projectedBalance = user.points + user.pendingPoints;
  const currentTierIndexRaw = resolvedTierLevels.findIndex((tier) => tier.name === derivedTierName);
  const currentTierIndex = Math.max(0, currentTierIndexRaw);
  const currentTierData = resolvedTierLevels[currentTierIndex];
  const nextTierData = resolvedTierLevels[currentTierIndex + 1] ?? null;
  const progressBase = currentTierData.min;
  const progressTarget = nextTierData ? nextTierData.min : Math.max(currentTierData.min, user.points);
  const tierProgress =
    nextTierData && progressTarget > progressBase
      ? Math.min(100, ((user.points - progressBase) / (progressTarget - progressBase)) * 100)
      : 100;
  const selectedTierInfo = useMemo(
    () => resolvedTierLevels.find((tier) => tier.name === selectedTier) ?? resolvedTierLevels[0],
    [resolvedTierLevels, selectedTier]
  );
  const [showWelcomeNotice, setShowWelcomeNotice] = useState(false);
  const recentFive = [...user.transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
  const now = useMemo(() => new Date(countdownNow), [countdownNow]);
  const tierBenefits: Record<TierName, string[]> = {
    Bronze: [
      "Earn base points on every qualifying purchase",
      "Access seasonal member campaigns and starter perks",
      "Track your progress toward Silver in real time",
    ],
    Silver: [
      "Unlock stronger bonus-point campaigns and exclusive surveys",
      "Get richer challenge rewards and faster points growth",
      "See priority reward drops before Bronze members",
    ],
    Gold: [
      "Receive premium point multipliers and top-tier recovery offers",
      "See the best reward value moments first",
      "Stay eligible for the most generous loyalty campaigns and recognitions",
    ],
  };
  const quickActions = [
    { to: "rewards", label: "Redeem now", caption: "Use your current balance", icon: WalletCards, className: "bg-white text-[#10213a]" },
    { to: "earn", label: "Earn points", caption: "Complete tasks and actions", icon: Zap, className: "bg-[#00A3AD] text-white" },
    { to: "activity", label: "View activity", caption: "Check recent earn/redeem records", icon: Activity, className: "bg-[#e8efff] text-[#1A2B47]" },
  ] as const;

  useEffect(() => {
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("points_rules")
          .select("id,tier_label,min_points,is_active")
          .eq("is_active", true);

        if (error || !data) return;
        const nextMinimums: Record<TierName, number> = { Bronze: 0, Silver: 250, Gold: 750 };
        for (const rule of data as TierRuleRow[]) {
          const tierLabel = String(rule.tier_label).toLowerCase();
          if (tierLabel === "bronze") nextMinimums.Bronze = Math.max(0, Number(rule.min_points) || 0);
          if (tierLabel === "silver") nextMinimums.Silver = Math.max(0, Number(rule.min_points) || 0);
          if (tierLabel === "gold") nextMinimums.Gold = Math.max(0, Number(rule.min_points) || 0);
        }
        setTierMinimums(nextMinimums);
      } catch {
      }
    })();
  }, []);

  useEffect(() => {
    setSelectedTier(derivedTierName);
  }, [derivedTierName]);

  useEffect(() => {
    setActiveCampaignIndex((current) => {
      if (activeCampaigns.length === 0) return 0;
      return Math.min(current, activeCampaigns.length - 1);
    });
  }, [activeCampaigns]);

  useEffect(() => {
    loadActivePromotionCampaigns(user.tier)
      .then((rows) => setActiveCampaigns(rows))
      .catch(() => setActiveCampaigns([]));
  }, [user.tier]);

  useEffect(() => {
    try {
      const rawNotice = localStorage.getItem(WELCOME_NOTICE_STORAGE_KEY);
      if (!rawNotice) return;

      const parsedNotice = JSON.parse(rawNotice) as { memberNumber?: string };
      if (parsedNotice.memberNumber === user.memberId) {
        setShowWelcomeNotice(true);
        localStorage.removeItem(WELCOME_NOTICE_STORAGE_KEY);
        return;
      }

      setShowWelcomeNotice(false);
    } catch {
      localStorage.removeItem(WELCOME_NOTICE_STORAGE_KEY);
      setShowWelcomeNotice(false);
    }
  }, [user.memberId]);

  return (
    <div className="space-y-6">
      <div className={customerPageHeroClass}>
        <div className={customerPageHeroInnerClass}>
          <div className={customerEyebrowClass}>Member Overview</div>
          <h1 className={customerPageTitleClass}>Dashboard</h1>
          <p className={customerPageDescriptionClass}>Welcome back, {user.fullName.split(" ")[0]}. Track your points, tiers, campaigns, and member benefits in one calmer workspace.</p>
        </div>
      </div>

      {showWelcomeNotice && (
        <Card className={cn(customerPanelSoftClass, "p-4 border-[#9ed8ff] bg-[#eef8ff]")}>
          <p className="text-sm text-[#1A2B47] font-medium">
            Welcome to Central Perk Rewards! Your welcome package points were applied to your account.
          </p>
        </Card>
      )}

      <section id="dashboard-overview" className="scroll-mt-28 grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <Card className="overflow-hidden border-0 bg-[radial-gradient(circle_at_top_right,rgba(53,212,220,0.24),transparent_24%),linear-gradient(135deg,#122846_0%,#1b3458_58%,#235a68_100%)] p-6 text-white shadow-[0_22px_60px_rgba(16,33,58,0.18)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/90">
                <Award className="h-3.5 w-3.5" />
                Member balance
              </div>
              <div className="mt-5 flex items-end gap-3">
                <h2 className="text-5xl font-black tracking-tight">{user.points.toLocaleString()}</h2>
                <p className="pb-1 text-sm uppercase tracking-[0.22em] text-white/72">points</p>
              </div>
              <p className="mt-3 max-w-lg text-sm leading-6 text-white/78">
                You are currently in <span className="font-semibold text-white">{derivedTierName}</span>. Keep momentum high with quick actions, active campaigns, and the next-tier tracker below.
              </p>
            </div>

            <div className="min-w-[220px] rounded-[24px] border border-white/12 bg-white/10 p-4 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-white/65">Tier progress</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {nextTierData ? `${Math.max(nextTierData.min - user.points, 0).toLocaleString()} pts to ${nextTierData.name}` : "Maximum tier reached"}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/14 p-3">
                  <currentTierData.icon className="h-5 w-5 text-white" />
                </div>
              </div>
              <div className="mt-4">
                <Progress value={tierProgress} className="h-2.5 bg-white/15 [&>div]:bg-[#35d4dc]" />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-white/72">
                <span>{user.points.toLocaleString()} pts</span>
                <span>{progressTarget.toLocaleString()} pts</span>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {quickActions.map((action) => (
              <Link key={action.to} to={action.to} className="group rounded-2xl border border-white/10 bg-white/8 p-4 transition hover:bg-white/12">
                <div className={`inline-flex rounded-xl p-3 ${action.className}`}>
                  <action.icon className="h-5 w-5" />
                </div>
                <p className="mt-4 text-base font-semibold text-white">{action.label}</p>
                <p className="mt-1 text-sm text-white/70">{action.caption}</p>
              </Link>
            ))}
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Card className={cn(customerPanelSoftClass, infoSurfaceClass)}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-gray-600 text-sm font-medium">Pending Points</p>
                <h2 className="text-3xl font-bold text-gray-900 mt-2">{user.pendingPoints}</h2>
                <p className="text-gray-500 text-sm mt-1">processing</p>
              </div>
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", infoPillClass)}>
                <Clock className="w-5 h-5 text-[#2563eb]" />
              </div>
            </div>
            <p className={cn("text-sm font-medium", infoTextStrongClass)}>Projected: {projectedBalance.toLocaleString()} pts</p>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-2">
            <Card className={customerPanelClass}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-gray-600 text-sm font-medium">Earned This Month</p>
                  <h2 className="text-3xl font-bold text-gray-900 mt-2">{user.earnedThisMonth}</h2>
                  <p className="text-gray-500 text-sm mt-1">points</p>
                </div>
                <div className="w-10 h-10 bg-[#dcfce7] rounded-lg flex items-center justify-center">
                  <ArrowUpRight className="w-5 h-5 text-[#16a34a]" />
                </div>
              </div>
              <p className="text-gray-600 text-sm">
                {
                  user.transactions.filter(
                    (t) =>
                      t.type === "earned" &&
                      new Date(t.date).getMonth() === now.getMonth() &&
                      new Date(t.date).getFullYear() === now.getFullYear()
                  ).length
                } earning transactions
              </p>
            </Card>

            <Card className={customerPanelClass}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-gray-600 text-sm font-medium">Redeemed This Month</p>
                  <h2 className="text-3xl font-bold text-gray-900 mt-2">{user.redeemedThisMonth}</h2>
                  <p className="text-gray-500 text-sm mt-1">points</p>
                </div>
                <div className="w-10 h-10 bg-[#ffedd5] rounded-lg flex items-center justify-center">
                  <ArrowDownRight className="w-5 h-5 text-[#f97316]" />
                </div>
              </div>
              <p className="text-gray-600 text-sm">
                {
                  user.transactions.filter(
                    (t) =>
                      t.type === "redeemed" &&
                      new Date(t.date).getMonth() === now.getMonth() &&
                      new Date(t.date).getFullYear() === now.getFullYear()
                  ).length
                } redemption actions
              </p>
            </Card>
          </div>
        </div>
      </section>

      <div id="dashboard-activity" className="scroll-mt-28">
        <Card className={customerPanelClass}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900">Recent Transactions (Last 5)</h3>
              <p className="text-gray-500 text-sm mt-1">Your latest earn and redeem activity at a glance</p>
            </div>
            <div className="w-12 h-12 bg-[#dbeafe] rounded-xl flex items-center justify-center">
              <Activity className="w-6 h-6 text-[#2563eb]" />
            </div>
          </div>
          <div className="space-y-2">
            {recentFive.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white px-3 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge className={tx.type === "redeemed" ? "bg-[#fff7ed] text-[#c2410c]" : "bg-[#ecfdf3] text-[#15803d]"}>
                      {tx.type === "redeemed" ? "Redeem" : "Earn"}
                    </Badge>
                    <p className="text-sm font-medium text-gray-900">{tx.description}</p>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{new Date(tx.date).toLocaleDateString()}</p>
                </div>
                <p className={`text-sm font-semibold ${tx.type === "redeemed" ? "text-orange-600" : "text-green-600"}`}>
                  {tx.type === "redeemed" ? "-" : "+"}{Math.abs(tx.points)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div id="dashboard-promotions" className="scroll-mt-28">
        {activeCampaigns.length > 0 ? (
          <Card className="overflow-hidden border-[#c9f3f3] bg-[linear-gradient(135deg,#eefcfc_0%,#ffffff_100%)] p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-[#10213a] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                  Live Promotions
                </div>
                <h2 className="mt-3 text-2xl font-bold text-[#10213d]">Active campaign carousel</h2>
                <p className="mt-1 text-sm text-[#56708f]">Swipe through live campaigns and watch each expiry countdown update in real time.</p>
              </div>
              <Badge className={brandTealSolidClass}>{activeCampaigns.length} active</Badge>
            </div>

            <div className="mt-5 rounded-[28px] border border-[#d6eefa] bg-white/75 p-4 shadow-[0_16px_40px_rgba(16,33,58,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-[#bfdcf2] bg-[#f8fcff] text-[#355071]">
                    {activeCampaignIndex + 1} of {activeCampaigns.length}
                  </Badge>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#5c7493]">
                    Swipe or use the arrows to move between offers
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Show previous campaign"
                    onClick={() => setActiveCampaignIndex((current) => (current === 0 ? activeCampaigns.length - 1 : current - 1))}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d7e8f6] bg-white text-[#183153] transition hover:bg-[#f3f9ff]"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Show next campaign"
                    onClick={() => setActiveCampaignIndex((current) => (current === activeCampaigns.length - 1 ? 0 : current + 1))}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d7e8f6] bg-white text-[#183153] transition hover:bg-[#f3f9ff]"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="relative mt-4 overflow-hidden rounded-[24px]">
                <div
                  className="flex transition-transform duration-500 ease-out"
                  style={{ transform: `translateX(-${activeCampaignIndex * 100}%)` }}
                >
                  {activeCampaigns.slice(0, 6).map((campaign) => (
                    <div key={campaign.id} className="min-w-full">
                      <div className="grid gap-4 rounded-[24px] border border-[#d6e4f5] bg-white p-5 shadow-sm lg:grid-cols-[1.2fr_0.8fr]">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={brandNavyBadgeClass}>
                              {campaign.campaignType === "flash_sale" ? "Flash Sale" : campaign.campaignType === "multiplier_event" ? "Multiplier Event" : "Bonus Campaign"}
                            </Badge>
                            {campaign.eligibleTiers.length > 0 ? <Badge variant="outline">{campaign.eligibleTiers.join(", ")}</Badge> : null}
                            <Badge className={campaign.endsAt ? "bg-[#ecfdf3] text-[#166534]" : "bg-[#eff6ff] text-[#1d4ed8]"}>
                              {formatCampaignCountdown(campaign.endsAt, countdownNow)}
                            </Badge>
                          </div>
                          <h3 className="mt-4 text-2xl font-semibold text-gray-900">{campaign.bannerTitle || campaign.campaignName}</h3>
                          <p className="mt-2 max-w-xl text-sm leading-6 text-gray-600">{campaign.bannerMessage || campaign.description}</p>
                          <p className="mt-4 text-xs text-[#1A2B47]">
                            {campaign.multiplier > 1 ? `${campaign.multiplier.toFixed(0)}x points` : `${campaign.bonusPoints} bonus points`} | Ends{" "}
                            {new Date(campaign.endsAt).toLocaleString()}
                          </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                          <div className="rounded-2xl border border-[#dbe9f6] bg-[#f8fbff] p-4">
                            <p className="text-xs uppercase tracking-[0.16em] text-[#67809d]">Offer type</p>
                            <p className="mt-2 text-base font-semibold text-[#10213d]">
                              {campaign.campaignType === "flash_sale" ? "Limited-time reward" : campaign.campaignType === "multiplier_event" ? "Multiplier bonus" : "Member bonus"}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-[#dbe9f6] bg-[#f8fbff] p-4">
                            <p className="text-xs uppercase tracking-[0.16em] text-[#67809d]">Perk</p>
                            <p className="mt-2 text-base font-semibold text-[#10213d]">
                              {campaign.multiplier > 1 ? `${campaign.multiplier.toFixed(0)}x on qualifying purchases` : `${campaign.bonusPoints} bonus points unlocked`}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-center gap-2">
                {activeCampaigns.slice(0, 6).map((campaign, index) => (
                  <button
                    key={campaign.id}
                    type="button"
                    aria-label={`Go to campaign ${index + 1}`}
                    onClick={() => setActiveCampaignIndex(index)}
                    className={cn(
                      "h-2.5 rounded-full transition-all",
                      index === activeCampaignIndex ? "w-8 bg-[#10213d]" : "w-2.5 bg-[#c9d8e8] hover:bg-[#9fb6cf]"
                    )}
                  />
                ))}
              </div>
            </div>
          </Card>
        ) : (
          <Card className={customerPanelClass}>
            <h3 className="text-lg font-semibold text-gray-900">No active promotions right now</h3>
            <p className="mt-2 text-sm text-gray-600">Check back soon for bonus point campaigns, flash sales, and multiplier events.</p>
          </Card>
        )}
      </div>

      <Card id="dashboard-benefits" className={cn(customerPanelClass, "scroll-mt-28")}>
        <button
          type="button"
          onClick={() => setBenefitsExpanded((prev) => !prev)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">Tier Benefits</h3>
            <p className="text-sm text-gray-600 mt-1">Collapse or expand the benefit list for your current tier handoff view.</p>
          </div>
          <Badge variant="outline" className="border-[#1A2B47]/30 text-[#23385a]">
            {derivedTierName} tier
          </Badge>
          {benefitsExpanded ? <ChevronUp className="h-5 w-5 text-[#1A2B47]" /> : <ChevronDown className="h-5 w-5 text-[#1A2B47]" />}
        </button>
        {benefitsExpanded ? (
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            {tierBenefits[derivedTierName].map((feature) => (
              <div key={feature} className="rounded-xl border border-gray-200 p-3 bg-white flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-[#1A2B47] mt-0.5 flex-shrink-0" />
                <p className="text-sm text-gray-700">{feature}</p>
              </div>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
