import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  ChartColumnIncreasing,
  DollarSign,
  Download,
  Medal,
  Search,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/button";
import { useAdminData } from "../hooks/use-admin-data";
import {
  buildAnalyticsDataset,
  buildAnalyticsWorkbook,
  type AnalyticsTierFilter,
} from "../lib/analytics";
import { loadSocialShareEvents, type ShareEvent } from "../../lib/member-engagement";
import { adminPrimaryButtonClass, adminSelectClass } from "../lib/page-theme";

const moneyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("en-US");

function formatMoney(value: number) {
  return moneyFormatter.format(value || 0);
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

function formatCompactNumber(value: number) {
  return integerFormatter.format(Math.round(value || 0));
}

function formatShortDate(value: string | null) {
  if (!value) return "No activity";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "No activity";
  return parsed.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDateTime(value: string | null) {
  if (!value) return "Not logged";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not logged";
  return parsed.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function renderMonthYearTick(props: {
  x?: number;
  y?: number;
  payload?: { value?: string };
  textColor: string;
}) {
  const { x = 0, y = 0, payload, textColor } = props;
  const rawValue = String(payload?.value || "").trim();
  const [month = rawValue, year = ""] = rawValue.split(" ");

  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fill={textColor} fontSize={12}>
        <tspan x="0" dy="0.35em">{month}</tspan>
        {year ? <tspan x="0" dy="1.1em">{year}</tspan> : null}
      </text>
    </g>
  );
}

function tierBadgeClass(tier: "Bronze" | "Silver" | "Gold") {
  if (tier === "Gold") return "bg-[#fff7cc] text-[#ca8a04]";
  if (tier === "Silver") return "bg-[#f1f5f9] text-[#64748b]";
  return "bg-[#fff1e8] text-[#ea580c]";
}

function riskBadgeClass(riskLevel: "Low" | "Medium" | "High") {
  if (riskLevel === "High") return "bg-[#fee2e2] text-[#b91c1c] border-[#fecaca]";
  if (riskLevel === "Medium") return "bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]";
  return "bg-[#e6f8fa] text-[#0f5f65] border-[#bde7eb]";
}

function engagementLevelBadgeClass(level: "Low" | "Medium" | "High") {
  if (level === "High") return "bg-[#dcfce7] text-[#166534] border-[#bbf7d0]";
  if (level === "Medium") return "bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]";
  return "bg-[#eef2ff] text-[#4338ca] border-[#c7d2fe]";
}

function overviewCardClass(index: number) {
  const variants = [
    "border-[#c9f3f3] bg-[linear-gradient(135deg,#ffffff_0%,#edfdfc_100%)]",
    "border-[#d9e6ff] bg-[linear-gradient(135deg,#ffffff_0%,#eff5ff_100%)]",
    "border-[#efe0ff] bg-[linear-gradient(135deg,#ffffff_0%,#f8f1ff_100%)]",
    "border-[#ffe2ba] bg-[linear-gradient(135deg,#ffffff_0%,#fff6ea_100%)]",
  ];
  return variants[index] || variants[0];
}

type AnalyticsTab = "overview" | "churn" | "core" | "breakage" | "rewards" | "sharing" | "engagement";

const analyticsTabs: { value: AnalyticsTab; label: string; hash: string }[] = [
  { value: "overview", label: "LTV Overview", hash: "#analytics-overview" },
  { value: "core", label: "LTV Insights", hash: "#analytics-core" },
  { value: "churn", label: "Churn Risk", hash: "#analytics-churn" },
  { value: "breakage", label: "Breakage", hash: "#analytics-breakage" },
  { value: "rewards", label: "Reward ROI", hash: "#analytics-rewards" },
  { value: "sharing", label: "Social Sharing", hash: "#analytics-sharing" },
  { value: "engagement", label: "Engagement", hash: "#analytics-engagement" },
];

export default function AdminAnalyticsPage() {
  const { members, transactions, loading, error, tierRules, earningRules, metrics, insights } = useAdminData({ includeInsights: true, scope: "analytics" });
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");
  const [tierFilter, setTierFilter] = useState<AnalyticsTierFilter>("all");
  const [memberSearch, setMemberSearch] = useState("");
  const deferredMemberSearch = useDeferredValue(memberSearch);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const matchedTab = analyticsTabs.find((tab) => tab.hash === hash);
    if (matchedTab) {
      setActiveTab(matchedTab.value);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const current = analyticsTabs.find((tab) => tab.value === activeTab);
    if (!current) return;
    const nextUrl = `${window.location.pathname}${window.location.search}${current.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [activeTab]);

  const analytics = useMemo(
    () =>
      buildAnalyticsDataset({
        members,
        transactions,
        tierRules,
        earningRules,
        redemptionValuePerPoint: metrics.redemptionValuePerPoint,
        tierFilter,
      }),
    [members, transactions, tierRules, earningRules, metrics.redemptionValuePerPoint, tierFilter]
  );
  const [dbSocialShareEvents, setDbSocialShareEvents] = useState<ShareEvent[]>([]);
  const [socialShareEventsLoading, setSocialShareEventsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    loadSocialShareEvents()
      .then((rows) => {
        if (!alive) return;
        setDbSocialShareEvents(rows);
        setSocialShareEventsLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setDbSocialShareEvents([]);
        setSocialShareEventsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const searchedMembers = useMemo(() => {
    const query = deferredMemberSearch.trim().toLowerCase();
    if (!query) return analytics.filteredMembers;

    return analytics.filteredMembers.filter((member) => {
      const haystack = [
        member.memberId,
        member.fullName,
        member.tier,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [analytics.filteredMembers, deferredMemberSearch]);

  const visibleMembers = searchedMembers.slice(0, 100);

  const exportExcel = () => {
    try {
      const workbook = buildAnalyticsWorkbook(analytics);
      const blob = new Blob([workbook], { type: "application/vnd.ms-excel" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `centralperk-analytics-${new Date().toISOString().slice(0, 10)}.xls`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Analytics report exported.");
    } catch (exportError) {
      toast.error(exportError instanceof Error ? exportError.message : "Failed to export analytics.");
    }
  };

  if (loading) return <p className="text-base text-gray-700">Loading analytics...</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  const overviewCards = [
    {
      label: "Total Members",
      value: integerFormatter.format(analytics.overview.totalMembers),
      icon: Users,
      iconClass: "bg-[#dff7f5] text-[#0f766e]",
    },
    {
      label: "Total LTV",
      value: formatMoney(analytics.overview.totalLtv),
      icon: DollarSign,
      iconClass: "bg-[#e6f0ff] text-[#2563eb]",
    },
    {
      label: "Average LTV",
      value: formatMoney(analytics.overview.averageLtv),
      icon: TrendingUp,
      iconClass: "bg-[#f4e8ff] text-[#9333ea]",
    },
    {
      label: "Projected LTV",
      value: formatMoney(analytics.overview.projectedLtv),
      icon: Target,
      iconClass: "bg-[#fff0dd] text-[#ea580c]",
    },
  ];
  const overviewTopMembers = analytics.topMembers.slice(0, 5);
  const churnMembersPreview = insights.churn.members
    .slice()
    .sort((left, right) => {
      if (right.riskScore !== left.riskScore) return right.riskScore - left.riskScore;
      return right.daysInactive - left.daysInactive;
    })
    .slice(0, 8);
  const highlightedRiskMembers = insights.churn.members
    .filter((member) => member.riskLevel !== "Low")
    .slice()
    .sort((left, right) => {
      if (right.riskScore !== left.riskScore) return right.riskScore - left.riskScore;
      return right.daysInactive - left.daysInactive;
    })
    .slice(0, 3);
  const reengagementTrackingRows = insights.churn.members
    .filter((member) => member.latestActionStatus !== "No action logged" || member.latestActionAt || member.reengagementSuccess)
    .slice()
    .sort((left, right) => {
      const leftTime = left.latestActionAt ? new Date(left.latestActionAt).getTime() : 0;
      const rightTime = right.latestActionAt ? new Date(right.latestActionAt).getTime() : 0;
      return rightTime - leftTime;
    })
    .slice(0, 8);
  const totalTierLtv = analytics.tierAnalysis.reduce((sum, row) => sum + row.totalLtv, 0);
  const topMember = analytics.topMembers[0];
  const strongestTier = [...analytics.tierAnalysis].sort((left, right) => right.averageLtv - left.averageLtv)[0];
  const latestTrendPoint = analytics.trend[analytics.trend.length - 1];
  const previousTrendPoint = analytics.trend[analytics.trend.length - 2];
  const trendDelta = latestTrendPoint && previousTrendPoint
    ? latestTrendPoint.averageLtv - previousTrendPoint.averageLtv
    : 0;
  const lowRiskMembers = Math.max(
    0,
    insights.churn.overview.totalMembers -
      insights.churn.overview.highRiskMembers -
      insights.churn.overview.mediumRiskMembers
  );
  const topRewardByRoi = insights.rewards.effectiveness
    .slice()
    .sort((left, right) => right.roi - left.roi)[0];
  const weakestRewardByRoi = insights.rewards.effectiveness
    .slice()
    .sort((left, right) => left.roi - right.roi)[0];
  const socialShareEvents = dbSocialShareEvents;
  const totalSocialShares = socialShareEvents.length;
  const totalSocialConversions = socialShareEvents.reduce((sum, item) => sum + item.conversions, 0);
  const socialConversionRate = totalSocialShares > 0 ? (totalSocialConversions / totalSocialShares) * 100 : 0;
  const sharesByChannel = [
    {
      channel: "Facebook",
      shares: socialShareEvents.filter((item) => item.channel === "facebook").length,
      conversions: socialShareEvents.filter((item) => item.channel === "facebook").reduce((sum, item) => sum + item.conversions, 0),
    },
    {
      channel: "Instagram",
      shares: socialShareEvents.filter((item) => item.channel === "instagram").length,
      conversions: socialShareEvents.filter((item) => item.channel === "instagram").reduce((sum, item) => sum + item.conversions, 0),
    },
  ];
  const topSharedAchievements = socialShareEvents
    .slice()
    .sort((left, right) => right.conversions - left.conversions)
    .slice(0, 5);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="overflow-x-auto pb-1">
      <div className="inline-flex min-w-max items-center gap-1 rounded-full bg-[#eef3fb] p-1">
        {analyticsTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.value
                ? "bg-white text-[#1A2B47] ring-2 ring-[#2b4468]"
                : "bg-transparent text-gray-700 hover:bg-white/70"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      </div>

      {activeTab === "overview" ? (
      <div className="overflow-hidden rounded-[28px] border border-[#dbe6f7] bg-[radial-gradient(circle_at_top_left,#f1fbfd_0%,#ffffff_38%,#f6f8ff_100%)] shadow-[0_16px_60px_rgba(26,43,71,0.08)]">
        <div className="border-b border-[#e3e9f3] px-6 py-6 lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#bde7eb] bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#0f766e]">
                <ChartColumnIncreasing className="h-4 w-4" />
                LTV Dashboard
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#10213d] lg:text-4xl">
                Member Lifetime Value Overview
              </h1>
              <p className="mt-2 text-sm leading-6 text-[#4b607f] lg:text-base">
                Executive LTV snapshot built from live loyalty members, points transactions, tier rules, and redemption settings.
              </p>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-[#dbe7f6] bg-white/80 px-4 py-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#60728f]">Top Member</p>
                  <p className="mt-2 text-base font-semibold text-[#10213d]">{topMember?.fullName ?? "No member data"}</p>
                  <p className="text-sm text-[#0f766e]">{topMember ? formatMoney(topMember.ltv) : "PHP 0.00"} current LTV</p>
                </div>
                <div className="rounded-2xl border border-[#dbe7f6] bg-white/80 px-4 py-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#60728f]">Strongest Tier</p>
                  <p className="mt-2 text-base font-semibold text-[#10213d]">{strongestTier?.tier ?? "N/A"}</p>
                  <p className="text-sm text-[#4b607f]">
                    {strongestTier ? `${formatMoney(strongestTier.averageLtv)} avg LTV` : "No tier data"}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#dbe7f6] bg-white/80 px-4 py-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#60728f]">Monthly Momentum</p>
                  <p className="mt-2 flex items-center gap-2 text-base font-semibold text-[#10213d]">
                    <ArrowUpRight className={`h-4 w-4 ${trendDelta >= 0 ? "text-[#0f766e]" : "rotate-90 text-[#dc2626]"}`} />
                    {formatMoney(Math.abs(trendDelta))}
                  </p>
                  <p className="text-sm text-[#4b607f]">
                    vs last month average LTV
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[#243b63]">Filter by Tier</span>
                <select
                  value={tierFilter}
                  onChange={(event) => setTierFilter(event.target.value as AnalyticsTierFilter)}
                  className={`min-w-[180px] font-medium ${adminSelectClass}`}
                >
                  <option value="all">All Tiers</option>
                  <option value="Bronze">Bronze</option>
                  <option value="Silver">Silver</option>
                  <option value="Gold">Gold</option>
                </select>
              </label>

              <Button
                onClick={exportExcel}
                className={adminPrimaryButtonClass}
              >
                <Download className="mr-2 h-4 w-4" />
                Export to Excel
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 px-6 py-6 md:grid-cols-2 xl:grid-cols-4 lg:px-8">
          {overviewCards.map((card, index) => (
            <div
              key={card.label}
              className={`rounded-2xl border p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)] ${overviewCardClass(index)}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-[#5b6b84]">{card.label}</p>
                  <p className="mt-3 text-3xl font-bold tracking-tight text-[#10213d]">{card.value}</p>
                </div>
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${card.iconClass}`}>
                  <card.icon className="h-7 w-7" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 px-6 pb-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
          <div className="rounded-[24px] border border-[#d9e3f2] bg-white/85 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#60728f]">Top Members</p>
                <h2 className="mt-2 text-2xl font-bold text-[#10213d]">Highest-value members right now</h2>
                <p className="mt-1 text-sm text-[#60728f]">A quick leaderboard for screenshots and fast admin review.</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#eef6ff_0%,#f7efff_100%)] text-[#3b82f6]">
                <Medal className="h-6 w-6" />
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {overviewTopMembers.map((member, index) => (
                <div
                  key={`${member.memberId}-${member.rank}-overview`}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl border border-[#e7edf7] bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_100%)] px-4 py-3"
                >
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-bold ${
                    index === 0
                      ? "bg-[#fff6d8] text-[#b45309]"
                      : index === 1
                        ? "bg-[#eef2f7] text-[#475569]"
                        : "bg-[#fff1e8] text-[#c2410c]"
                  }`}>
                    #{member.rank}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-[#10213d]">{member.fullName}</p>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${tierBadgeClass(member.tier)}`}>
                        {member.tier}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#60728f]">
                      {member.memberId} • {formatCompactNumber(member.totalPoints)} earned points • {formatPercent(member.conversionRate)} conversion
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-bold text-[#10213d]">{formatMoney(member.ltv)}</p>
                    <p className="text-xs font-medium text-[#0f766e]">Proj. {formatMoney(member.projectedLtv)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[24px] border border-[#d9e3f2] bg-white/85 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#60728f]">Tier Mix</p>
                  <h2 className="mt-2 text-2xl font-bold text-[#10213d]">LTV contribution by tier</h2>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#e9fbf8_0%,#eef4ff_100%)] text-[#0f766e]">
                  <Sparkles className="h-6 w-6" />
                </div>
              </div>

              <div className="mt-4 h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.tierAnalysis} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#e6edf7" strokeDasharray="4 4" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={(value) => `${Math.round(value)}`} />
                    <YAxis type="category" dataKey="tier" tick={{ fill: "#243b63", fontSize: 12, fontWeight: 600 }} width={56} />
                    <Tooltip
                      formatter={(value: number, label: string) => [formatMoney(value), label]}
                      contentStyle={{ borderRadius: 16, borderColor: "#dbe4f0" }}
                    />
                    <Bar dataKey="totalLtv" radius={[0, 12, 12, 0]}>
                      {analytics.tierAnalysis.map((row) => (
                        <Cell key={row.tier} fill={analytics.tierSegmentation.find((segment) => segment.tier === row.tier)?.color ?? "#94a3b8"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 space-y-3">
                {analytics.tierAnalysis.map((row) => {
                  const share = totalTierLtv > 0 ? (row.totalLtv / totalTierLtv) * 100 : 0;
                  return (
                    <div key={`${row.tier}-summary`} className="rounded-2xl border border-[#e7edf7] bg-[#fbfdff] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: analytics.tierSegmentation.find((segment) => segment.tier === row.tier)?.color ?? "#94a3b8" }}
                            aria-hidden="true"
                          />
                          <p className="text-sm font-semibold text-[#10213d]">{row.tier}</p>
                        </div>
                        <p className="text-sm font-semibold text-[#243b63]">{share.toFixed(1)}%</p>
                      </div>
                      <p className="mt-2 text-sm text-[#60728f]">
                        {formatMoney(row.totalLtv)} total LTV from {formatCompactNumber(row.memberCount)} members
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-[22px] border border-[#d8e5f5] bg-[linear-gradient(135deg,#f7fffc_0%,#f0fbf8_100%)] p-4 shadow-[0_10px_24px_rgba(15,118,110,0.08)]">
                <div className="flex items-center gap-2 text-[#0f766e]">
                  <Users className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]">Member Health</p>
                </div>
                <p className="mt-3 text-2xl font-bold text-[#10213d]">{latestTrendPoint?.memberCount ?? analytics.overview.totalMembers}</p>
                <p className="mt-1 text-sm text-[#4b607f]">Members contributing to the latest LTV snapshot.</p>
              </div>

              <div className="rounded-[22px] border border-[#e4daf9] bg-[linear-gradient(135deg,#fcf8ff_0%,#f7f0ff_100%)] p-4 shadow-[0_10px_24px_rgba(147,51,234,0.08)]">
                <div className="flex items-center gap-2 text-[#7c3aed]">
                  <Zap className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]">Projected Avg</p>
                </div>
                <p className="mt-3 text-2xl font-bold text-[#10213d]">{latestTrendPoint ? formatMoney(latestTrendPoint.projectedLtv) : formatMoney(analytics.overview.projectedLtv)}</p>
                <p className="mt-1 text-sm text-[#4b607f]">Current average projected LTV based on live earning pace.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      ) : null}

      {activeTab === "churn" ? (
      <div className="overflow-hidden rounded-[28px] border border-[#f0d7da] bg-[radial-gradient(circle_at_top_left,#fff6f7_0%,#ffffff_38%,#fff9f5_100%)] shadow-[0_16px_60px_rgba(153,27,27,0.08)]">
        <div className="border-b border-[#f3dfe2] px-6 py-6 lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#f4c7cf] bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#b91c1c]">
                <Target className="h-4 w-4" />
                Churn Risk Dashboard
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#3f1d21] lg:text-4xl">
                Member Risk Scoring Overview
              </h1>
              <p className="mt-2 text-sm leading-6 text-[#6f4a52] lg:text-base">
                Surface churn-prone members using inactivity, transaction decline, recent spend behavior, and re-engagement signals.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 px-6 py-6 md:grid-cols-2 xl:grid-cols-4 lg:px-8">
          <div className="rounded-2xl border border-[#f3d9dd] bg-white p-5">
            <p className="text-sm font-medium text-[#8b5a62]">Total Members</p>
            <p className="mt-3 text-3xl font-bold text-[#3f1d21]">{formatCompactNumber(insights.churn.overview.totalMembers)}</p>
          </div>
          <div className="rounded-2xl border border-[#f3d9dd] bg-white p-5">
            <p className="text-sm font-medium text-[#8b5a62]">High Risk</p>
            <p className="mt-3 text-3xl font-bold text-[#b91c1c]">{formatCompactNumber(insights.churn.overview.highRiskMembers)}</p>
          </div>
          <div className="rounded-2xl border border-[#f3d9dd] bg-white p-5">
            <p className="text-sm font-medium text-[#8b5a62]">Medium Risk</p>
            <p className="mt-3 text-3xl font-bold text-[#c2410c]">{formatCompactNumber(insights.churn.overview.mediumRiskMembers)}</p>
          </div>
          <div className="rounded-2xl border border-[#f3d9dd] bg-white p-5">
            <p className="text-sm font-medium text-[#8b5a62]">Low Risk</p>
            <p className="mt-3 text-3xl font-bold text-[#0f5f65]">{formatCompactNumber(lowRiskMembers)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 px-6 pb-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8">
          <div className="rounded-[24px] border border-[#f3d9dd] bg-white p-6 shadow-[0_10px_30px_rgba(153,27,27,0.05)]">
            <h2 className="text-2xl font-bold text-[#3f1d21]">Risk Mix Snapshot</h2>
            <p className="mt-1 text-sm text-[#8b5a62]">How the current member base is distributed by churn severity.</p>
            <div className="mt-4 h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { label: "High", value: insights.churn.overview.highRiskMembers, color: "#dc2626" },
                      { label: "Medium", value: insights.churn.overview.mediumRiskMembers, color: "#f97316" },
                      { label: "Low", value: lowRiskMembers, color: "#14b8a6" },
                    ]}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="48%"
                    innerRadius={68}
                    outerRadius={112}
                    paddingAngle={4}
                  >
                    <Cell fill="#dc2626" />
                    <Cell fill="#f97316" />
                    <Cell fill="#14b8a6" />
                  </Pie>
                  <Tooltip
                    formatter={(value: number, label: string) => [formatCompactNumber(value), `${label} Risk Members`]}
                    contentStyle={{ borderRadius: 16, borderColor: "#f3d9dd" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#fee2e2] bg-[#fff7f7] p-4">
                <p className="text-sm font-semibold text-[#b91c1c]">High</p>
                <p className="mt-2 text-xl font-bold text-[#3f1d21]">{formatCompactNumber(insights.churn.overview.highRiskMembers)}</p>
              </div>
              <div className="rounded-2xl border border-[#fed7aa] bg-[#fffaf5] p-4">
                <p className="text-sm font-semibold text-[#c2410c]">Medium</p>
                <p className="mt-2 text-xl font-bold text-[#3f1d21]">{formatCompactNumber(insights.churn.overview.mediumRiskMembers)}</p>
              </div>
              <div className="rounded-2xl border border-[#bde7eb] bg-[#f3fcfc] p-4">
                <p className="text-sm font-semibold text-[#0f5f65]">Low</p>
                <p className="mt-2 text-xl font-bold text-[#3f1d21]">{formatCompactNumber(lowRiskMembers)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-[#f3d9dd] bg-white p-6 shadow-[0_10px_30px_rgba(153,27,27,0.05)]">
            <h2 className="text-2xl font-bold text-[#3f1d21]">Tier Exposure</h2>
            <p className="mt-1 text-sm text-[#8b5a62]">At-risk concentration and churn rate by loyalty tier.</p>
            <div className="mt-4 space-y-3">
              {insights.churn.segmentRates.map((row) => (
                <div key={row.segment} className="rounded-2xl border border-[#f6e4e6] bg-[#fffdfd] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-[#3f1d21]">{row.segment}</p>
                    <p className="text-lg font-bold text-[#b91c1c]">{formatPercent(row.churnRate)}</p>
                  </div>
                  <p className="mt-1 text-sm text-[#8b5a62]">
                    {formatCompactNumber(row.atRiskMembers)} at-risk members out of {formatCompactNumber(row.members)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 pb-8 lg:px-8">
          <div className="rounded-[24px] border border-[#f3d9dd] bg-white p-6 shadow-[0_10px_30px_rgba(153,27,27,0.05)]">
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-[#3f1d21]">At-Risk Member Dashboard</h2>
                <p className="mt-1 text-sm text-[#8b5a62]">
                  High-priority members ranked by churn risk with last activity dates and recommended next actions.
                </p>
              </div>
              <div className="rounded-2xl border border-[#f6e4e6] bg-[#fff8f8] px-4 py-3 text-sm text-[#6f4a52]">
                Showing {churnMembersPreview.length} members ranked by current risk score
              </div>
            </div>

            <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
              {highlightedRiskMembers.length > 0 ? (
                highlightedRiskMembers.map((member) => (
                  <div
                    key={`${member.memberId}-highlight`}
                    className="rounded-[22px] border border-[#f6d4d9] bg-[linear-gradient(135deg,#fff8f8_0%,#fffdfd_100%)] p-4 shadow-[0_10px_24px_rgba(153,27,27,0.05)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#3f1d21]">{member.fullName}</p>
                        <p className="text-xs text-[#8b5a62]">{member.memberId}</p>
                      </div>
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${riskBadgeClass(member.riskLevel)}`}>
                        {member.riskLevel}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-2xl border border-[#f8e4e7] bg-white px-3 py-2">
                        <p className="text-xs uppercase tracking-[0.16em] text-[#8b5a62]">Last Active</p>
                        <p className="mt-2 font-semibold text-[#3f1d21]">{formatShortDate(member.lastActivityDate)}</p>
                      </div>
                      <div className="rounded-2xl border border-[#f8e4e7] bg-white px-3 py-2">
                        <p className="text-xs uppercase tracking-[0.16em] text-[#8b5a62]">Score</p>
                        <p className="mt-2 font-semibold text-[#3f1d21]">{member.riskScore}</p>
                      </div>
                    </div>
                    <div className="mt-3 rounded-2xl border border-[#f8e4e7] bg-white px-3 py-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-[#8b5a62]">Recommended Action</p>
                      <p className="mt-2 text-sm text-[#6f4a52]">{member.recommendedAction}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="xl:col-span-3 rounded-[22px] border border-[#f6d4d9] bg-[linear-gradient(135deg,#fff8f8_0%,#fffdfd_100%)] p-5 text-sm text-[#6f4a52]">
                  No members are currently marked as medium or high risk. The table below still shows the latest ranked members and actions.
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px]">
                <thead>
                  <tr className="border-b border-[#f1e1e4]">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#8b5a62]">Member</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#8b5a62]">Tier</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-[#8b5a62]">Risk Score</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#8b5a62]">Risk Label</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#8b5a62]">Last Activity</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-[#8b5a62]">Inactive Days</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#8b5a62]">Recommended Action</th>
                  </tr>
                </thead>
                <tbody>
                  {churnMembersPreview.map((member) => (
                    <tr key={`${member.memberId}-risk`} className="border-b border-[#f8ecee] last:border-b-0">
                      <td className="px-4 py-4">
                        <div>
                          <p className="text-sm font-semibold text-[#3f1d21]">{member.fullName}</p>
                          <p className="text-xs text-[#8b5a62]">{member.memberId}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tierBadgeClass(member.tier)}`}>
                          {member.tier}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right text-sm font-semibold text-[#3f1d21]">{member.riskScore}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${riskBadgeClass(member.riskLevel)}`}>
                          {member.riskLevel}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-[#3f1d21]">{formatShortDate(member.lastActivityDate)}</td>
                      <td className="px-4 py-4 text-right text-sm text-[#3f1d21]">{formatCompactNumber(member.daysInactive)}</td>
                      <td className="px-4 py-4 text-sm text-[#6f4a52]">{member.recommendedAction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {churnMembersPreview.length === 0 ? (
                <p className="py-10 text-center text-sm text-[#8b5a62]">No churn risk rows are available for the current dataset.</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="px-6 pb-8 lg:px-8">
          <div className="rounded-[24px] border border-[#f3d9dd] bg-white p-6 shadow-[0_10px_30px_rgba(153,27,27,0.05)]">
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-[#3f1d21]">Re-Engagement Tracking</h2>
                <p className="mt-1 text-sm text-[#8b5a62]">
                  Track sent actions, latest status changes, and whether members responded after outreach.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-[#f6e4e6] bg-[#fff8f8] px-4 py-3 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b5a62]">Actions</p>
                  <p className="mt-2 text-2xl font-bold text-[#3f1d21]">{formatCompactNumber(insights.churn.reengagementSummary.totalActions)}</p>
                </div>
                <div className="rounded-2xl border border-[#d7efe8] bg-[#f7fffb] px-4 py-3 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5b7f72]">Responded</p>
                  <p className="mt-2 text-2xl font-bold text-[#15803d]">{formatCompactNumber(insights.churn.reengagementSummary.successfulActions)}</p>
                </div>
                <div className="rounded-2xl border border-[#f7e1c5] bg-[#fffaf5] px-4 py-3 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b5a62]">Pending</p>
                  <p className="mt-2 text-2xl font-bold text-[#c2410c]">{formatCompactNumber(insights.churn.reengagementSummary.pendingActions)}</p>
                </div>
              </div>
            </div>

            <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[22px] border border-[#f6e4e6] bg-[linear-gradient(135deg,#fff8f8_0%,#fffdfd_100%)] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b5a62]">Tracking Snapshot</p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between rounded-2xl border border-[#f8e4e7] bg-white px-4 py-3">
                    <span className="text-sm text-[#6f4a52]">Success Rate</span>
                    <span className="text-lg font-bold text-[#15803d]">{formatPercent(insights.churn.reengagementSummary.successRate)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-[#f8e4e7] bg-white px-4 py-3">
                    <span className="text-sm text-[#6f4a52]">Member Re-engagement Rate</span>
                    <span className="text-lg font-bold text-[#3f1d21]">{formatPercent(insights.churn.overview.reengagementSuccessRate)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-[#f8e4e7] bg-white px-4 py-3">
                    <span className="text-sm text-[#6f4a52]">Most Recent Tracked Rows</span>
                    <span className="text-lg font-bold text-[#3f1d21]">{formatCompactNumber(reengagementTrackingRows.length)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-[22px] border border-[#f6e4e6] bg-[linear-gradient(135deg,#fff8f8_0%,#fffdfd_100%)] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b5a62]">Status Legend</p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-[#d7efe8] bg-white p-4">
                    <p className="text-sm font-semibold text-[#15803d]">Responded</p>
                    <p className="mt-1 text-sm text-[#6f4a52]">Member showed successful re-engagement after the action was sent.</p>
                  </div>
                  <div className="rounded-2xl border border-[#f8e4e7] bg-white p-4">
                    <p className="text-sm font-semibold text-[#b91c1c]">Not Responded</p>
                    <p className="mt-1 text-sm text-[#6f4a52]">Action was logged but no successful return signal has been detected yet.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px]">
                <thead>
                  <tr className="border-b border-[#f1e1e4]">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#8b5a62]">Member</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#8b5a62]">Risk</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#8b5a62]">Latest Action</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#8b5a62]">Logged At</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#8b5a62]">Outcome</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#8b5a62]">Status Change</th>
                  </tr>
                </thead>
                <tbody>
                  {reengagementTrackingRows.map((member) => (
                    <tr key={`${member.memberId}-reengagement`} className="border-b border-[#f8ecee] last:border-b-0">
                      <td className="px-4 py-4">
                        <div>
                          <p className="text-sm font-semibold text-[#3f1d21]">{member.fullName}</p>
                          <p className="text-xs text-[#8b5a62]">{member.memberId}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${riskBadgeClass(member.riskLevel)}`}>
                          {member.riskLevel}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-[#3f1d21]">{member.latestActionStatus}</td>
                      <td className="px-4 py-4 text-sm text-[#3f1d21]">{formatShortDateTime(member.latestActionAt)}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                          member.reengagementSuccess
                            ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]"
                            : "border-[#fecaca] bg-[#fff1f2] text-[#b91c1c]"
                        }`}>
                          {member.reengagementSuccess ? "Responded" : "Not responded"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-[#6f4a52]">
                        {member.reengagementSuccess
                          ? "At-risk outreach led to a successful follow-up signal."
                          : "Waiting for a response or post-campaign recovery signal."}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {reengagementTrackingRows.length === 0 ? (
                <p className="py-10 text-center text-sm text-[#8b5a62]">
                  No re-engagement actions have been logged yet, so there is no tracking history to display.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      ) : null}

      {activeTab === "core" ? (
      <>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_0.95fr]">
        <div className="rounded-[24px] border border-[#dce4f0] bg-white p-6 shadow-[0_12px_40px_rgba(17,24,39,0.06)]">
          <div className="mb-5">
            <h2 className="text-2xl font-bold text-[#10213d]">LTV Trends Over Time</h2>
            <p className="mt-1 text-sm text-[#60728f]">
              Average and projected LTV across the last 12 months using the current analytics scope.
            </p>
          </div>

          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.trend} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#dbe4f0" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 12 }} />
                <YAxis tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={(value) => `PHP ${Math.round(value)}`} />
                <Tooltip
                  formatter={(value: number, label: string) => [formatMoney(value), label]}
                  contentStyle={{ borderRadius: 16, borderColor: "#dbe4f0" }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="averageLtv"
                  name="Average LTV"
                  stroke="#14b8a6"
                  strokeWidth={3}
                  dot={{ r: 3, strokeWidth: 2, fill: "#ffffff" }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="projectedLtv"
                  name="Projected LTV"
                  stroke="#f59e0b"
                  strokeWidth={3}
                  dot={{ r: 3, strokeWidth: 2, fill: "#ffffff" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[24px] border border-[#dce4f0] bg-white p-6 shadow-[0_12px_40px_rgba(17,24,39,0.06)]">
          <div className="mb-5">
            <h2 className="text-2xl font-bold text-[#10213d]">Segmentation by Tier</h2>
            <p className="mt-1 text-sm text-[#60728f]">
              Total current LTV contribution grouped by live tier membership.
            </p>
          </div>

          {analytics.tierSegmentation.every((entry) => entry.value === 0) ? (
            <p className="py-20 text-center text-sm text-[#60728f]">No tier data available for the current filter.</p>
          ) : (
            <>
              <div className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics.tierSegmentation}
                      dataKey="value"
                      nameKey="tier"
                      cx="50%"
                      cy="48%"
                      innerRadius={68}
                      outerRadius={112}
                      paddingAngle={4}
                    >
                      {analytics.tierSegmentation.map((entry) => (
                        <Cell key={entry.tier} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, _label, item) => [
                        formatMoney(value),
                        `${item?.payload?.tier ?? "Tier"} LTV`,
                      ]}
                      contentStyle={{ borderRadius: 16, borderColor: "#dbe4f0" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {analytics.tierSegmentation.map((entry) => (
                  <div key={entry.tier} className="rounded-2xl border border-[#e6edf7] bg-[#fbfdff] p-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3.5 w-3.5 rounded-full"
                        style={{ backgroundColor: entry.color }}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-semibold text-[#243b63]">{entry.tier}</span>
                    </div>
                    <p className="mt-3 text-xl font-bold text-[#10213d]">{formatMoney(entry.value)}</p>
                    <p className="text-xs text-[#60728f]">{integerFormatter.format(entry.members)} members</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="rounded-[24px] border border-[#dce4f0] bg-white p-6 shadow-[0_12px_40px_rgba(17,24,39,0.06)]">
        <div className="mb-5">
          <h2 className="text-2xl font-bold text-[#10213d]">Tier Analysis</h2>
          <p className="mt-1 text-sm text-[#60728f]">
            Real-time tier performance based on computed lifetime value and projected future value.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-[#dbe4f0]">
                <th className="px-4 py-3 text-left text-sm font-semibold text-[#5b6b84]">Tier</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-[#5b6b84]">Member Count</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-[#5b6b84]">Total LTV</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-[#5b6b84]">Average LTV</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-[#5b6b84]">Projected LTV</th>
              </tr>
            </thead>
            <tbody>
              {analytics.tierAnalysis.map((row) => (
                <tr key={row.tier} className="border-b border-[#edf2f9] last:border-b-0">
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tierBadgeClass(row.tier)}`}>
                      {row.tier}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right text-sm font-medium text-[#10213d]">
                    {integerFormatter.format(row.memberCount)}
                  </td>
                  <td className="px-4 py-4 text-right text-sm font-semibold text-[#10213d]">
                    {formatMoney(row.totalLtv)}
                  </td>
                  <td className="px-4 py-4 text-right text-sm text-[#10213d]">{formatMoney(row.averageLtv)}</td>
                  <td className="px-4 py-4 text-right text-sm text-[#10213d]">{formatMoney(row.projectedLtv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-[24px] border border-[#dce4f0] bg-white p-6 shadow-[0_12px_40px_rgba(17,24,39,0.06)]">
        <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[#10213d]">Top 100 Most Valuable Members</h2>
            <p className="mt-1 text-sm text-[#60728f]">
              Ranked by live lifetime value with projection based on average monthly points performance.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block min-w-[260px]">
              <span className="mb-2 block text-sm font-medium text-[#243b63]">Search Member</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#60728f]" />
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                  placeholder="MEM"
                  className="w-full rounded-xl border border-[#cfd8e7] bg-white py-2.5 pl-10 pr-4 text-sm font-medium text-[#10213d] outline-none transition focus:border-[#00A3AD] focus:ring-2 focus:ring-[#00A3AD]/20"
                />
              </div>
            </label>
            <p className="text-sm font-medium text-[#243b63] sm:pb-2">
              Showing {visibleMembers.length} of {searchedMembers.length} matches
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="border-b border-[#dbe4f0]">
                <th className="px-4 py-3 text-left text-sm font-semibold text-[#5b6b84]">Rank</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-[#5b6b84]">Member ID</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-[#5b6b84]">Tier</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-[#5b6b84]">Total Points</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-[#5b6b84]">Conversion Rate</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-[#5b6b84]">LTV</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-[#5b6b84]">Projected LTV</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-[#5b6b84]">Months Active</th>
              </tr>
            </thead>
            <tbody>
              {visibleMembers.map((member) => (
                <tr key={`${member.memberId}-${member.rank}`} className="border-b border-[#edf2f9] last:border-b-0">
                  <td className="px-4 py-4 text-sm font-semibold text-[#10213d]">{member.rank}</td>
                  <td className="px-4 py-4">
                    <div>
                      <p className="text-sm font-semibold text-[#10213d]">{member.memberId}</p>
                      <p className="text-xs text-[#60728f]">{member.fullName}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tierBadgeClass(member.tier)}`}>
                      {member.tier}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right text-sm text-[#10213d]">
                    {integerFormatter.format(member.totalPoints)}
                  </td>
                  <td className="px-4 py-4 text-right text-sm text-[#10213d]">{formatPercent(member.conversionRate)}</td>
                  <td className="px-4 py-4 text-right text-sm font-semibold text-[#16a34a]">{formatMoney(member.ltv)}</td>
                  <td className="px-4 py-4 text-right text-sm font-semibold text-[#ea580c]">
                    {formatMoney(member.projectedLtv)}
                  </td>
                  <td className="px-4 py-4 text-right text-sm text-[#10213d]">
                    {integerFormatter.format(member.monthsActive)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {visibleMembers.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#60728f]">
              No members matched your search in the selected tier scope.
            </p>
          ) : null}
        </div>
      </div>

      <div className="rounded-[24px] border border-[#bfd7ff] bg-[linear-gradient(135deg,#eef5ff_0%,#f8fbff_100%)] p-6 shadow-[0_10px_30px_rgba(59,130,246,0.08)]">
        <h2 className="text-2xl font-bold text-[#163a8a]">LTV Calculation Formula</h2>
        <div className="mt-4 space-y-3 text-sm leading-7 text-[#1d4ed8] lg:text-base">
          <p>
            <span className="font-semibold">LTV</span> = Total Points Earned x Conversion Rate
          </p>
          <p>
            <span className="font-semibold">Projected Future LTV</span> = Current LTV + (Average Monthly Points x 12 months x Conversion Rate)
          </p>
          <p className="text-sm text-[#315bb5]">
            Conversion rate is derived from the active redemption value per point, the configured tier multiplier,
            and each member&apos;s real engagement and redemption behavior, capped between 1% and 5%.
          </p>
        </div>
      </div>
      </>
      ) : null}

      {activeTab === "breakage" ? (
      <div className="overflow-hidden rounded-[28px] border border-[#ead9b7] bg-[radial-gradient(circle_at_top_left,#fff8e8_0%,#ffffff_38%,#fffdf7_100%)] shadow-[0_16px_60px_rgba(180,120,0,0.08)]">
        <div className="border-b border-[#f0e2bf] px-6 py-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#f4d68f] bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#a16207]">
              <Target className="h-4 w-4" />
              Breakage Analysis
            </div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-[#5b3a00]">Breakage Analysis Dashboard</h2>
            <p className="mt-2 text-sm leading-6 text-[#7c5b22] lg:text-base">
              Monitor expired points, financial impact, future breakage exposure, and open points scheduled to expire.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 px-6 py-6 md:grid-cols-2 xl:grid-cols-4 lg:px-8">
          <div className="rounded-2xl border border-[#f4dfad] bg-white p-5">
            <p className="text-sm font-medium text-[#8a6b2e]">Expired Points</p>
            <p className="mt-3 text-3xl font-bold text-[#5b3a00]">{formatCompactNumber(insights.breakage.overview.totalExpiredPoints)}</p>
          </div>
          <div className="rounded-2xl border border-[#f4dfad] bg-white p-5">
            <p className="text-sm font-medium text-[#8a6b2e]">Breakage Rate</p>
            <p className="mt-3 text-3xl font-bold text-[#5b3a00]">{formatPercent(insights.breakage.overview.breakageRate)}</p>
          </div>
          <div className="rounded-2xl border border-[#f4dfad] bg-white p-5">
            <p className="text-sm font-medium text-[#8a6b2e]">Open Expiring Points</p>
            <p className="mt-3 text-3xl font-bold text-[#5b3a00]">{formatCompactNumber(insights.breakage.overview.openExpiringPoints)}</p>
          </div>
          <div className="rounded-2xl border border-[#f4dfad] bg-white p-5">
            <p className="text-sm font-medium text-[#8a6b2e]">Projected Future Loss</p>
            <p className="mt-3 text-3xl font-bold text-[#5b3a00]">{formatMoney(insights.breakage.overview.projectedFutureBreakageValue)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 px-6 pb-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
          <div className="rounded-[24px] border border-[#ecdcb7] bg-white p-6 shadow-[0_10px_30px_rgba(180,120,0,0.05)]">
            <h3 className="text-xl font-bold text-[#5b3a00]">Monthly Breakage Trend</h3>
            <p className="mt-1 text-sm text-[#8a6b2e]">Actual vs projected expired points and value over time.</p>
            <div className="mt-4 h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={insights.breakage.monthlyTrend}>
                  <CartesianGrid stroke="#f1e4c5" strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="month"
                    interval={0}
                    height={52}
                    tick={(props) => renderMonthYearTick({ ...props, textColor: "#8a6b2e" })}
                  />
                  <YAxis tick={{ fill: "#8a6b2e", fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: 16, borderColor: "#ecdcb7" }} />
                  <Legend />
                  <Line type="monotone" dataKey="actualPoints" name="Actual expired points" stroke="#b45309" strokeWidth={3} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="projectedPoints" name="Projected points" stroke="#f59e0b" strokeWidth={3} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-[24px] border border-[#ecdcb7] bg-white p-6 shadow-[0_10px_30px_rgba(180,120,0,0.05)]">
            <h3 className="text-xl font-bold text-[#5b3a00]">Tier Breakage</h3>
            <p className="mt-1 text-sm text-[#8a6b2e]">Expired points and rate by member tier.</p>
            <div className="mt-4 space-y-3">
              {insights.breakage.tierAnalysis.map((row) => (
                <div key={row.tier} className="rounded-2xl border border-[#f1e4c5] bg-[#fffdf8] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#5b3a00]">{row.tier}</p>
                      <p className="text-sm text-[#8a6b2e]">{formatCompactNumber(row.expiredPoints)} expired from {formatCompactNumber(row.earnedPoints)} earned</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-[#5b3a00]">{formatPercent(row.breakageRate)}</p>
                      <p className="text-xs text-[#8a6b2e]">{formatMoney(row.expiredValue)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 pb-8 lg:px-8">
          <div className="rounded-[24px] border border-[#ecdcb7] bg-white p-6 shadow-[0_10px_30px_rgba(180,120,0,0.05)]">
            <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-xl font-bold text-[#5b3a00]">Six-Month Forecast</h3>
                <p className="mt-1 text-sm text-[#8a6b2e]">Upcoming expiring points and projected future breakage.</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-[#f1e4c5]">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#8a6b2e]">Month</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-[#8a6b2e]">Expiring Points</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-[#8a6b2e]">Projected Breakage</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-[#8a6b2e]">Projected Value</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.breakage.forecast.map((row) => (
                    <tr key={row.month} className="border-b border-[#f8efdb] last:border-b-0">
                      <td className="px-4 py-4 text-sm font-medium text-[#5b3a00]">{row.month}</td>
                      <td className="px-4 py-4 text-right text-sm text-[#5b3a00]">{formatCompactNumber(row.expiringPoints)}</td>
                      <td className="px-4 py-4 text-right text-sm text-[#5b3a00]">{formatCompactNumber(row.projectedBreakagePoints)}</td>
                      <td className="px-4 py-4 text-right text-sm font-semibold text-[#b45309]">{formatMoney(row.projectedBreakageValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      ) : null}

      {activeTab === "rewards" ? (
      <div className="overflow-hidden rounded-[28px] border border-[#d7e7da] bg-[radial-gradient(circle_at_top_left,#eefcf1_0%,#ffffff_38%,#f7fffa_100%)] shadow-[0_16px_60px_rgba(22,101,52,0.08)]">
        <div className="border-b border-[#deefe2] px-6 py-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#bfe3ca] bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#166534]">
              <TrendingUp className="h-4 w-4" />
              Reward Effectiveness
            </div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-[#123524]">Reward Effectiveness Dashboard</h2>
            <p className="mt-2 text-sm leading-6 text-[#3b5b48] lg:text-base">
              Measure redemption rate, ROI, incremental revenue, and reward-level recommendations from actual catalog performance.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 px-6 py-6 md:grid-cols-2 xl:grid-cols-4 lg:px-8">
          <div className="rounded-2xl border border-[#d9eedd] bg-white p-5">
            <p className="text-sm font-medium text-[#4a6b57]">Rewards Tracked</p>
            <p className="mt-3 text-3xl font-bold text-[#123524]">{formatCompactNumber(insights.rewards.overview.totalRewards)}</p>
          </div>
          <div className="rounded-2xl border border-[#d9eedd] bg-white p-5">
            <p className="text-sm font-medium text-[#4a6b57]">Total Redemptions</p>
            <p className="mt-3 text-3xl font-bold text-[#123524]">{formatCompactNumber(insights.rewards.overview.totalRedemptions)}</p>
          </div>
          <div className="rounded-2xl border border-[#d9eedd] bg-white p-5">
            <p className="text-sm font-medium text-[#4a6b57]">Average Redemption Rate</p>
            <p className="mt-3 text-3xl font-bold text-[#123524]">{formatPercent(insights.rewards.overview.averageRedemptionRate)}</p>
          </div>
          <div className="rounded-2xl border border-[#d9eedd] bg-white p-5">
            <p className="text-sm font-medium text-[#4a6b57]">Incremental Revenue</p>
            <p className="mt-3 text-3xl font-bold text-[#123524]">{formatMoney(insights.rewards.overview.totalIncrementalRevenue)}</p>
          </div>
          <div className="rounded-2xl border border-[#d9eedd] bg-white p-5">
            <p className="text-sm font-medium text-[#4a6b57]">Estimated Cost</p>
            <p className="mt-3 text-3xl font-bold text-[#123524]">{formatMoney(insights.rewards.overview.totalEstimatedCost)}</p>
          </div>
          <div className="rounded-2xl border border-[#d9eedd] bg-white p-5">
            <p className="text-sm font-medium text-[#4a6b57]">Best ROI Reward</p>
            <p className="mt-3 text-xl font-bold text-[#123524]">{topRewardByRoi?.rewardName ?? "No data"}</p>
            <p className="mt-1 text-sm font-semibold text-[#15803d]">
              {topRewardByRoi ? formatPercent(topRewardByRoi.roi) : "0.00%"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 px-6 pb-6 xl:grid-cols-[1.05fr_0.95fr] lg:px-8">
          <div className="rounded-[24px] border border-[#d9eedd] bg-white p-6 shadow-[0_10px_30px_rgba(22,101,52,0.05)]">
            <h3 className="text-xl font-bold text-[#123524]">Top Reward ROI</h3>
            <p className="mt-1 text-sm text-[#4a6b57]">Highest-performing rewards by ROI and redemption volume.</p>
            <div className="mt-4 h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={insights.rewards.mostPopular}>
                  <CartesianGrid stroke="#deefe2" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="rewardName" tick={{ fill: "#4a6b57", fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                  <YAxis tick={{ fill: "#4a6b57", fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: 16, borderColor: "#d9eedd" }} />
                  <Bar dataKey="roi" name="ROI %" fill="#16a34a" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[24px] border border-[#d9eedd] bg-white p-6 shadow-[0_10px_30px_rgba(22,101,52,0.05)]">
              <h3 className="text-xl font-bold text-[#123524]">Catalog Recommendations</h3>
              <p className="mt-1 text-sm text-[#4a6b57]">Specific changes suggested by the ROI and popularity engine.</p>
              <div className="mt-4 space-y-3">
                {insights.rewards.recommendations.map((recommendation, index) => (
                  <div key={recommendation} className="rounded-2xl border border-[#deefe2] bg-[#f8fff9] p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#dcfce7] text-sm font-bold text-[#166534]">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#123524]">Suggested catalog change</p>
                        <p className="mt-1 text-sm text-[#3b5b48]">{recommendation}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {insights.rewards.recommendations.length === 0 ? (
                  <p className="text-sm text-[#4a6b57]">Recommendations will appear when reward redemption data is available.</p>
                ) : null}
              </div>
            </div>

            <div className="rounded-[24px] border border-[#d9eedd] bg-white p-6 shadow-[0_10px_30px_rgba(22,101,52,0.05)]">
              <h3 className="text-xl font-bold text-[#123524]">ROI Snapshot</h3>
              <p className="mt-1 text-sm text-[#4a6b57]">Fast read on the strongest and weakest performers.</p>
              <div className="mt-4 grid grid-cols-1 gap-3">
                <div className="rounded-2xl border border-[#d8f1de] bg-[#f7fff9] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4a6b57]">Best Performer</p>
                  <p className="mt-2 text-lg font-bold text-[#123524]">{topRewardByRoi?.rewardName ?? "No data"}</p>
                  <p className="mt-1 text-sm text-[#15803d]">
                    {topRewardByRoi ? `${formatPercent(topRewardByRoi.roi)} ROI • ${formatPercent(topRewardByRoi.redemptionRate)} redemption rate` : "No data"}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#f6e1e1] bg-[#fff8f8] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7f4a4a]">Needs Attention</p>
                  <p className="mt-2 text-lg font-bold text-[#123524]">{weakestRewardByRoi?.rewardName ?? "No data"}</p>
                  <p className={`mt-1 text-sm ${weakestRewardByRoi && weakestRewardByRoi.roi < 0 ? "text-[#b91c1c]" : "text-[#7f4a4a]"}`}>
                    {weakestRewardByRoi ? `${formatPercent(weakestRewardByRoi.roi)} ROI • ${formatPercent(weakestRewardByRoi.redemptionRate)} redemption rate` : "No data"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 px-6 pb-6 lg:grid-cols-2 lg:px-8">
          <div className="rounded-[24px] border border-[#d9eedd] bg-white p-6 shadow-[0_10px_30px_rgba(22,101,52,0.05)]">
            <div className="mb-5">
              <h3 className="text-xl font-bold text-[#123524]">Most Popular Rewards</h3>
              <p className="mt-1 text-sm text-[#4a6b57]">Rewards getting the most redemption pull from the current catalog.</p>
            </div>
            <div className="space-y-3">
              {insights.rewards.mostPopular.map((row, index) => (
                <div key={`${row.rewardId}-popular`} className="rounded-2xl border border-[#deefe2] bg-[#f8fff9] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#123524]">#{index + 1} {row.rewardName}</p>
                      <p className="mt-1 text-xs text-[#4a6b57]">{row.category} • {formatCompactNumber(row.redemptionCount)} redemptions</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-[#123524]">{formatPercent(row.redemptionRate)}</p>
                      <p className={`text-xs font-medium ${row.roi >= 0 ? "text-[#15803d]" : "text-[#b91c1c]"}`}>{formatPercent(row.roi)} ROI</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-[#d9eedd] bg-white p-6 shadow-[0_10px_30px_rgba(22,101,52,0.05)]">
            <div className="mb-5">
              <h3 className="text-xl font-bold text-[#123524]">Least Popular Rewards</h3>
              <p className="mt-1 text-sm text-[#4a6b57]">Rewards that may need better visibility, repositioning, or replacement.</p>
            </div>
            <div className="space-y-3">
              {insights.rewards.leastPopular.map((row, index) => (
                <div key={`${row.rewardId}-least`} className="rounded-2xl border border-[#edf3ee] bg-[#fcfffc] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#123524]">#{index + 1} {row.rewardName}</p>
                      <p className="mt-1 text-xs text-[#4a6b57]">{row.category} • {formatCompactNumber(row.redemptionCount)} redemptions</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-[#123524]">{formatPercent(row.redemptionRate)}</p>
                      <p className={`text-xs font-medium ${row.roi >= 0 ? "text-[#15803d]" : "text-[#b91c1c]"}`}>{formatPercent(row.roi)} ROI</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-[#3b5b48]">{row.recommendation}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 pb-8 lg:px-8">
          <div className="rounded-[24px] border border-[#d9eedd] bg-white p-6 shadow-[0_10px_30px_rgba(22,101,52,0.05)]">
            <div className="mb-5">
              <h3 className="text-xl font-bold text-[#123524]">ROI Calculation Output</h3>
              <p className="mt-1 text-sm text-[#4a6b57]">Full ROI reporting with redemption rate, cost, incremental revenue, and recommendation output.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px]">
                <thead>
                  <tr className="border-b border-[#deefe2]">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#4a6b57]">Reward</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#4a6b57]">Category</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-[#4a6b57]">Redemptions</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-[#4a6b57]">Rate</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-[#4a6b57]">Avg Days</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-[#4a6b57]">Estimated Cost</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-[#4a6b57]">Incremental Revenue</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-[#4a6b57]">ROI</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#4a6b57]">Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.rewards.effectiveness.map((row) => (
                    <tr key={row.rewardId} className="border-b border-[#edf7ef] last:border-b-0">
                      <td className="px-4 py-4 text-sm font-semibold text-[#123524]">{row.rewardName}</td>
                      <td className="px-4 py-4 text-sm text-[#123524]">{row.category}</td>
                      <td className="px-4 py-4 text-right text-sm text-[#123524]">{formatCompactNumber(row.redemptionCount)}</td>
                      <td className="px-4 py-4 text-right text-sm text-[#123524]">{formatPercent(row.redemptionRate)}</td>
                      <td className="px-4 py-4 text-right text-sm text-[#123524]">{row.averageDaysToRedeem.toFixed(1)}</td>
                      <td className="px-4 py-4 text-right text-sm text-[#123524]">{formatMoney(row.estimatedCost)}</td>
                      <td className="px-4 py-4 text-right text-sm text-[#123524]">{formatMoney(row.incrementalRevenue)}</td>
                      <td className={`px-4 py-4 text-right text-sm font-semibold ${row.roi >= 0 ? "text-[#15803d]" : "text-[#b91c1c]"}`}>{formatPercent(row.roi)}</td>
                      <td className="px-4 py-4 text-sm text-[#3b5b48]">{row.recommendation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      ) : null}

      {activeTab === "sharing" ? (
      <div className="overflow-hidden rounded-[28px] border border-[#d6dff7] bg-[radial-gradient(circle_at_top_left,#f4f6ff_0%,#ffffff_38%,#fbfcff_100%)] shadow-[0_16px_60px_rgba(67,56,202,0.08)]">
        <div className="border-b border-[#e0e8fb] px-6 py-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#cbd7ff] bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#4338ca]">
              <Share2 className="h-4 w-4" />
              Social Sharing Analytics
            </div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-[#1e1b4b]">Share and conversion tracking</h2>
            <p className="mt-2 text-sm leading-6 text-[#4b587c] lg:text-base">
              Monitor member shares, conversion lift, and the top-performing achievement moments from the customer portal.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 px-6 py-6 md:grid-cols-2 xl:grid-cols-4 lg:px-8">
          <div className="rounded-2xl border border-[#dbe3fb] bg-white p-5">
            <p className="text-sm font-medium text-[#5d6e95]">Tracked Shares</p>
            <p className="mt-3 text-3xl font-bold text-[#1e1b4b]">{formatCompactNumber(totalSocialShares)}</p>
          </div>
          <div className="rounded-2xl border border-[#dbe3fb] bg-white p-5">
            <p className="text-sm font-medium text-[#5d6e95]">Conversions</p>
            <p className="mt-3 text-3xl font-bold text-[#1e1b4b]">{formatCompactNumber(totalSocialConversions)}</p>
          </div>
          <div className="rounded-2xl border border-[#dbe3fb] bg-white p-5">
            <p className="text-sm font-medium text-[#5d6e95]">Conversion Rate</p>
            <p className="mt-3 text-3xl font-bold text-[#1e1b4b]">{formatPercent(socialConversionRate)}</p>
          </div>
          <div className="rounded-2xl border border-[#dbe3fb] bg-white p-5">
            <p className="text-sm font-medium text-[#5d6e95]">Top Achievement</p>
            <p className="mt-3 text-lg font-bold text-[#1e1b4b]">{topSharedAchievements[0]?.achievement ?? "No data yet"}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 px-6 pb-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
          <div className="rounded-[24px] border border-[#dbe3fb] bg-white p-6 shadow-[0_10px_30px_rgba(67,56,202,0.05)]">
            <h3 className="text-xl font-bold text-[#1e1b4b]">Channel Performance</h3>
            <p className="mt-1 text-sm text-[#5d6e95]">Share count and conversion output by social channel.</p>
            <div className="mt-4 h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sharesByChannel}>
                  <CartesianGrid stroke="#e4e9fb" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="channel" tick={{ fill: "#5d6e95", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#5d6e95", fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: 16, borderColor: "#dbe3fb" }} />
                  <Legend />
                  <Bar dataKey="shares" name="Shares" fill="#4338ca" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="conversions" name="Conversions" fill="#14b8a6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-[24px] border border-[#dbe3fb] bg-white p-6 shadow-[0_10px_30px_rgba(67,56,202,0.05)]">
            <h3 className="text-xl font-bold text-[#1e1b4b]">Top Shared Achievements</h3>
            <p className="mt-1 text-sm text-[#5d6e95]">Highest-performing shared moments based on tracked conversions.</p>
            <div className="mt-4 space-y-3">
              {topSharedAchievements.map((event) => (
                <div key={event.id} className="rounded-2xl border border-[#e4e9fb] bg-[#fafbff] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#1e1b4b]">{event.achievement}</p>
                      <p className="text-sm text-[#5d6e95]">{event.memberName} • {event.channel}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-[#1e1b4b]">{event.conversions}</p>
                      <p className="text-xs text-[#5d6e95]">conversions</p>
                    </div>
                  </div>
                </div>
              ))}
              {topSharedAchievements.length === 0 ? (
                <p className="text-sm text-[#5d6e95]">
                  {socialShareEventsLoading
                    ? "Loading tracked share metrics from the backend."
                    : "Share metrics will appear here once members start sharing achievements."}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="px-6 pb-8 lg:px-8">
          <div className="rounded-[24px] border border-[#dbe3fb] bg-white p-6 shadow-[0_10px_30px_rgba(67,56,202,0.05)]">
            <div className="mb-5">
              <h3 className="text-xl font-bold text-[#1e1b4b]">Share Tracking Records</h3>
              <p className="mt-1 text-sm text-[#5d6e95]">Recorded share events with channel, timestamp, and conversion counts.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px]">
                <thead>
                  <tr className="border-b border-[#e4e9fb]">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#5d6e95]">Member</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#5d6e95]">Channel</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#5d6e95]">Achievement</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-[#5d6e95]">Conversions</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#5d6e95]">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {socialShareEvents.map((event) => (
                    <tr key={event.id} className="border-b border-[#eef2ff] last:border-b-0">
                      <td className="px-4 py-4 text-sm font-semibold text-[#1e1b4b]">{event.memberName}</td>
                      <td className="px-4 py-4 text-sm text-[#1e1b4b]">{event.channel}</td>
                      <td className="px-4 py-4 text-sm text-[#4b587c]">{event.achievement}</td>
                      <td className="px-4 py-4 text-right text-sm font-semibold text-[#1e1b4b]">{formatCompactNumber(event.conversions)}</td>
                      <td className="px-4 py-4 text-sm text-[#4b587c]">{formatShortDateTime(event.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {socialShareEvents.length === 0 ? (
                <p className="py-10 text-center text-sm text-[#5d6e95]">
                  {socialShareEventsLoading
                    ? "Loading backend share records."
                    : "No share events are available yet."}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      ) : null}

      {activeTab === "engagement" ? (
      <div className="overflow-hidden rounded-[28px] border border-[#d6dff7] bg-[radial-gradient(circle_at_top_left,#f1f5ff_0%,#ffffff_38%,#f8faff_100%)] shadow-[0_16px_60px_rgba(67,56,202,0.08)]">
        <div className="border-b border-[#e0e8fb] px-6 py-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#cbd7ff] bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#4338ca]">
              <Zap className="h-4 w-4" />
              Engagement Score
            </div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-[#1e1b4b]">Engagement Score Dashboard</h2>
            <p className="mt-2 text-sm leading-6 text-[#4b587c] lg:text-base">
              Track engagement score trends, high/medium/low segments, top drivers, and member-level score movement over time.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 px-6 py-6 md:grid-cols-2 xl:grid-cols-4 lg:px-8">
          <div className="rounded-2xl border border-[#dbe3fb] bg-white p-5">
            <p className="text-sm font-medium text-[#5d6e95]">Average Score</p>
            <p className="mt-3 text-3xl font-bold text-[#1e1b4b]">{insights.engagement.overview.averageScore.toFixed(1)}</p>
          </div>
          <div className="rounded-2xl border border-[#dbe3fb] bg-white p-5">
            <p className="text-sm font-medium text-[#5d6e95]">High Engagement</p>
            <p className="mt-3 text-3xl font-bold text-[#1e1b4b]">{formatCompactNumber(insights.engagement.overview.highMembers)}</p>
          </div>
          <div className="rounded-2xl border border-[#dbe3fb] bg-white p-5">
            <p className="text-sm font-medium text-[#5d6e95]">Medium Engagement</p>
            <p className="mt-3 text-3xl font-bold text-[#1e1b4b]">{formatCompactNumber(insights.engagement.overview.mediumMembers)}</p>
          </div>
          <div className="rounded-2xl border border-[#dbe3fb] bg-white p-5">
            <p className="text-sm font-medium text-[#5d6e95]">Low Engagement</p>
            <p className="mt-3 text-3xl font-bold text-[#1e1b4b]">{formatCompactNumber(insights.engagement.overview.lowMembers)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 px-6 pb-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8">
          <div className="rounded-[24px] border border-[#dbe3fb] bg-white p-6 shadow-[0_10px_30px_rgba(67,56,202,0.05)]">
            <h3 className="text-xl font-bold text-[#1e1b4b]">Score Trend Over Time</h3>
            <p className="mt-1 text-sm text-[#5d6e95]">Average score plus high/medium/low member mix for each month.</p>
            <div className="mt-4 h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={insights.engagement.trend}>
                  <CartesianGrid stroke="#e4e9fb" strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="month"
                    interval={0}
                    height={52}
                    tick={(props) => renderMonthYearTick({ ...props, textColor: "#5d6e95" })}
                  />
                  <YAxis tick={{ fill: "#5d6e95", fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: 16, borderColor: "#dbe3fb" }} />
                  <Legend />
                  <Line type="monotone" dataKey="averageScore" name="Average Score" stroke="#4338ca" strokeWidth={3} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="highMembers" name="High" stroke="#16a34a" strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="mediumMembers" name="Medium" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="lowMembers" name="Low" stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-[24px] border border-[#dbe3fb] bg-white p-6 shadow-[0_10px_30px_rgba(67,56,202,0.05)]">
            <h3 className="text-xl font-bold text-[#1e1b4b]">Primary Drivers</h3>
            <p className="mt-1 text-sm text-[#5d6e95]">What most strongly drives engagement across the member base.</p>
            <div className="mt-4 space-y-3">
              {insights.engagement.drivers.map((driver) => (
                <div key={driver.driver} className="rounded-2xl border border-[#e4e9fb] bg-[#fafbff] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#1e1b4b]">{driver.driver}</p>
                      <p className="text-sm text-[#5d6e95]">{formatCompactNumber(driver.members)} members</p>
                    </div>
                    <p className="text-lg font-bold text-[#4338ca]">{driver.averageContribution.toFixed(1)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 pb-8 lg:px-8">
          <div className="rounded-[24px] border border-[#dbe3fb] bg-white p-6 shadow-[0_10px_30px_rgba(67,56,202,0.05)]">
            <div className="mb-5">
              <h3 className="text-xl font-bold text-[#1e1b4b]">Member Scoreboard</h3>
              <p className="mt-1 text-sm text-[#5d6e95]">Member engagement score, score change, activity mix, and top driver.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px]">
                <thead>
                  <tr className="border-b border-[#e4e9fb]">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#5d6e95]">Member</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#5d6e95]">Tier</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#5d6e95]">Level</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-[#5d6e95]">Score</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-[#5d6e95]">Change</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-[#5d6e95]">Transactions</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-[#5d6e95]">Points Earned</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-[#5d6e95]">Redemptions</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-[#5d6e95]">Logins</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-[#5d6e95]">Primary Driver</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.engagement.members.slice(0, 25).map((member) => (
                    <tr key={member.memberId} className="border-b border-[#eef2ff] last:border-b-0">
                      <td className="px-4 py-4">
                        <div>
                          <p className="text-sm font-semibold text-[#1e1b4b]">{member.memberId}</p>
                          <p className="text-xs text-[#5d6e95]">{member.fullName}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-[#1e1b4b]">{member.tier}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${engagementLevelBadgeClass(member.level)}`}>
                          {member.level}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right text-sm font-semibold text-[#1e1b4b]">{member.score}</td>
                      <td className={`px-4 py-4 text-right text-sm font-semibold ${member.scoreChange >= 0 ? "text-[#15803d]" : "text-[#b91c1c]"}`}>
                        {member.scoreChange >= 0 ? "+" : ""}{member.scoreChange}
                      </td>
                      <td className="px-4 py-4 text-right text-sm text-[#1e1b4b]">{formatCompactNumber(member.transactionCount)}</td>
                      <td className="px-4 py-4 text-right text-sm text-[#1e1b4b]">{formatCompactNumber(member.pointsEarned)}</td>
                      <td className="px-4 py-4 text-right text-sm text-[#1e1b4b]">{formatCompactNumber(member.redemptionCount)}</td>
                      <td className="px-4 py-4 text-right text-sm text-[#1e1b4b]">{formatCompactNumber(member.loginCount)}</td>
                      <td className="px-4 py-4 text-sm text-[#4b587c]">{member.primaryDriver}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      ) : null}
    </div>
  );
}
