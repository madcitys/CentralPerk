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
  ChartColumnIncreasing,
  DollarSign,
  Download,
  Search,
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

function tierBadgeClass(tier: "Bronze" | "Silver" | "Gold") {
  if (tier === "Gold") return "bg-[#fff7cc] text-[#ca8a04]";
  if (tier === "Silver") return "bg-[#f1f5f9] text-[#64748b]";
  return "bg-[#fff1e8] text-[#ea580c]";
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

type AnalyticsTab = "overview" | "core" | "breakage" | "rewards" | "engagement";

const analyticsTabs: { value: AnalyticsTab; label: string; hash: string }[] = [
  { value: "overview", label: "Overview", hash: "#analytics-overview" },
  { value: "core", label: "LTV Core", hash: "#analytics-core" },
  { value: "breakage", label: "Breakage", hash: "#analytics-breakage" },
  { value: "rewards", label: "Reward ROI", hash: "#analytics-rewards" },
  { value: "engagement", label: "Engagement", hash: "#analytics-engagement" },
];

export default function AdminAnalyticsPage() {
  const { members, transactions, loading, error, tierRules, earningRules, metrics, insights } = useAdminData();
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
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#bde7eb] bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#0f766e]">
                <ChartColumnIncreasing className="h-4 w-4" />
                Analytics & Insights
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#10213d] lg:text-4xl">
                Member Lifetime Value Analysis
              </h1>
              <p className="mt-2 text-sm leading-6 text-[#4b607f] lg:text-base">
                Live LTV reporting built from actual loyalty members, points transactions, tier rules, and redemption settings.
              </p>
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
                  <XAxis dataKey="month" tick={{ fill: "#8a6b2e", fontSize: 12 }} />
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
        </div>

        <div className="grid grid-cols-1 gap-6 px-6 pb-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
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

          <div className="rounded-[24px] border border-[#d9eedd] bg-white p-6 shadow-[0_10px_30px_rgba(22,101,52,0.05)]">
            <h3 className="text-xl font-bold text-[#123524]">Recommendation Feed</h3>
            <p className="mt-1 text-sm text-[#4a6b57]">Priority actions based on live reward performance.</p>
            <div className="mt-4 space-y-3">
              {insights.rewards.recommendations.map((recommendation) => (
                <div key={recommendation} className="rounded-2xl border border-[#deefe2] bg-[#f8fff9] p-4">
                  <p className="text-sm font-medium text-[#123524]">{recommendation}</p>
                </div>
              ))}
              {insights.rewards.recommendations.length === 0 ? (
                <p className="text-sm text-[#4a6b57]">Recommendations will appear when reward redemption data is available.</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="px-6 pb-8 lg:px-8">
          <div className="rounded-[24px] border border-[#d9eedd] bg-white p-6 shadow-[0_10px_30px_rgba(22,101,52,0.05)]">
            <div className="mb-5">
              <h3 className="text-xl font-bold text-[#123524]">Reward Performance Table</h3>
              <p className="mt-1 text-sm text-[#4a6b57]">ROI-style reward reporting with redemption rate, cost, and incremental revenue.</p>
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
                  <XAxis dataKey="month" tick={{ fill: "#5d6e95", fontSize: 12 }} />
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
