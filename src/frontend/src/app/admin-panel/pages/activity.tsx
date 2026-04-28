import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, Line, LineChart } from "recharts";
import { CalendarDatePicker } from "../../../components/calendar-date-picker";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { useAdminData } from "../hooks/use-admin-data";
import { toast } from "sonner";
import {
  adminDarkButtonClass,
  adminEyebrowClass,
  adminPrimaryButtonClass,
  adminPageDescriptionClass,
  adminPageHeroClass,
  adminPageHeroInnerClass,
  adminPageShellClass,
  adminPageTitleClass,
  adminPanelClass,
  adminPanelSoftClass,
  adminSelectClass,
} from "../lib/page-theme";

function toInputDate(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthLabel(value: Date) {
  return value.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

type TransactionQuickFilter = "all" | "earned" | "redeemed" | "other";
type TransactionRangePreset = "custom" | "today" | "last7" | "last30" | "thisMonth";

function classifyTransactionType(transactionType: string, points: number) {
  const rawType = String(transactionType || "").trim().toUpperCase();
  if (rawType === "EXPIRY_DEDUCTION" || rawType === "EXPIRED") return "other";
  if (rawType.includes("REDEEM") || rawType === "GIFT") return "redeemed";
  if (rawType === "PURCHASE" || rawType === "EARN" || rawType === "MANUAL_AWARD" || rawType === "WELCOME_PACKAGE") {
    return "earned";
  }
  if (points > 0) return "earned";
  if (points < 0) return "redeemed";
  return "other";
}

export default function AdminActivityPage() {
  const { transactions, loading, error, metrics } = useAdminData({ scope: "activity" });
  const [activityFilter, setActivityFilter] = useState<"all" | "active" | "warm" | "inactive">("all");
  const [transactionFilter, setTransactionFilter] = useState<TransactionQuickFilter>("all");
  const [transactionRangePreset, setTransactionRangePreset] = useState<TransactionRangePreset>("custom");
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 6);
    return toInputDate(date);
  });
  const [endDate, setEndDate] = useState(() => toInputDate(new Date()));
  const [builderSegmentName, setBuilderSegmentName] = useState("Gold reactivation test");
  const [builderLogicMode, setBuilderLogicMode] = useState<"AND" | "OR">("AND");
  const [builderPreviewCount, setBuilderPreviewCount] = useState(1);
  const [builderLastRecalculated, setBuilderLastRecalculated] = useState(() => new Date().toLocaleString());
  const [builderConditions, setBuilderConditions] = useState([
    { id: "tier", field: "Tier", operator: "is", value: "Gold" },
    { id: "activity", field: "Last Activity", operator: "is within", value: "30 days" },
  ]);

  const handleStartDateChange = (value: string) => {
    setTransactionRangePreset("custom");
    setStartDate(value);
  };

  const handleEndDateChange = (value: string) => {
    setTransactionRangePreset("custom");
    setEndDate(value);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBuilderPreviewCount(builderLogicMode === "AND" ? 1 : 3);
      setBuilderLastRecalculated(new Date().toLocaleString());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [builderConditions, builderLogicMode, builderSegmentName]);

  const filteredTransactions = useMemo(() => {
    const start = startDate ? new Date(`${startDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const end = endDate ? new Date(`${endDate}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;
    return transactions.filter((tx) => {
      const timestamp = new Date(tx.transaction_date).getTime();
      return timestamp >= start && timestamp <= end;
    });
  }, [transactions, startDate, endDate]);

  const filteredActivityRows = useMemo(
    () =>
      metrics.memberActivityRows.filter((row) =>
        activityFilter === "all" ? true : row.activityLevel === activityFilter
      ),
    [metrics.memberActivityRows, activityFilter]
  );

  const visibleTransactions = useMemo(() => {
    if (transactionFilter === "all") return filteredTransactions;
    return filteredTransactions.filter((tx) => classifyTransactionType(tx.transaction_type, Number(tx.points || 0)) === transactionFilter);
  }, [filteredTransactions, transactionFilter]);

  const transactionFilterOptions = useMemo(() => {
    const counts = filteredTransactions.reduce<Record<TransactionQuickFilter, number>>(
      (acc, tx) => {
        const bucket = classifyTransactionType(tx.transaction_type, Number(tx.points || 0));
        acc.all += 1;
        acc[bucket] += 1;
        return acc;
      },
      { all: 0, earned: 0, redeemed: 0, other: 0 }
    );

    return [
      { value: "all" as const, label: "All", count: counts.all },
      { value: "earned" as const, label: "Earned", count: counts.earned },
      { value: "redeemed" as const, label: "Redeemed", count: counts.redeemed },
      { value: "other" as const, label: "Adjustments", count: counts.other },
    ];
  }, [filteredTransactions]);

  const applyRangePreset = (preset: TransactionRangePreset) => {
    setTransactionRangePreset(preset);
    const today = new Date();
    const end = toInputDate(today);

    if (preset === "custom") return;
    if (preset === "today") {
      setStartDate(end);
      setEndDate(end);
      return;
    }
    if (preset === "last7") {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      setStartDate(toInputDate(start));
      setEndDate(end);
      return;
    }
    if (preset === "last30") {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      setStartDate(toInputDate(start));
      setEndDate(end);
      return;
    }
    if (preset === "thisMonth") {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(toInputDate(start));
      setEndDate(end);
    }
  };

  const earnedPointsTrend = useMemo(() => {
    const start = startDate ? new Date(`${startDate}T00:00:00`) : new Date();
    const end = endDate ? new Date(`${endDate}T23:59:59`) : new Date();
    const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
    const monthEnd = new Date(end.getFullYear(), end.getMonth(), 1);
    const monthlyTotals = new Map<string, { key: string; label: string; value: number }>();

    for (
      let cursor = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
      cursor <= monthEnd;
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    ) {
      const key = `${cursor.getFullYear()}-${`${cursor.getMonth() + 1}`.padStart(2, "0")}`;
      monthlyTotals.set(key, { key, label: formatMonthLabel(cursor), value: 0 });
    }

    for (const transaction of filteredTransactions) {
      if (Number(transaction.points || 0) <= 0) continue;
      const parsed = new Date(transaction.transaction_date);
      if (Number.isNaN(parsed.getTime())) continue;
      const key = `${parsed.getFullYear()}-${`${parsed.getMonth() + 1}`.padStart(2, "0")}`;
      const existing = monthlyTotals.get(key);
      if (!existing) continue;
      existing.value += Number(transaction.points || 0);
    }

    return Array.from(monthlyTotals.values());
  }, [endDate, filteredTransactions, startDate]);

  const downloadStatement = () => {
    if (visibleTransactions.length === 0) return;

    const header = "Date,Member Number,Member Name,Type,Points\n";
    const rows = visibleTransactions
      .map((transaction) => {
        const memberNumber = transaction.loyalty_members?.member_number || "N/A";
        const memberName = transaction.loyalty_members
          ? `${transaction.loyalty_members.first_name} ${transaction.loyalty_members.last_name}`
          : "Unknown";
        const date = new Date(transaction.transaction_date).toLocaleDateString();
        return `${date},${memberNumber},"${memberName}",${transaction.transaction_type},${transaction.points}`;
      })
      .join("\n");

    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "points_statement.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadPdf = () => {
    try {
      if (visibleTransactions.length === 0) {
        toast.error("No activity available to export.");
        return;
      }

      const htmlRows = visibleTransactions
        .map((transaction) => {
          const memberNumber = transaction.loyalty_members?.member_number || "N/A";
          const memberName = transaction.loyalty_members
            ? `${transaction.loyalty_members.first_name} ${transaction.loyalty_members.last_name}`
            : "Unknown";
          const date = new Date(transaction.transaction_date).toLocaleDateString();
          return `<tr><td>${date}</td><td>${memberNumber}</td><td>${memberName}</td><td>${transaction.transaction_type}</td><td>${transaction.points}</td></tr>`;
        })
        .join("");

      const html = `
        <html>
          <head>
            <title>CentralPerk Admin Activity Report</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
              .brand { display:flex; justify-content:space-between; align-items:center; background:#1A2B47; color:#fff; padding:12px 16px; border-radius:8px; }
              table { width: 100%; border-collapse: collapse; margin-top: 12px; }
              th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 12px; }
              th { background: #f3f4f6; }
            </style>
          </head>
          <body>
            <div class="brand"><strong>CentralPerk Rewards</strong><span>Admin Activity Report</span></div>
            <p>Generated: ${new Date().toLocaleString()}</p>
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Member #</th><th>Member Name</th><th>Type</th><th>Points</th>
                </tr>
              </thead>
              <tbody>${htmlRows}</tbody>
            </table>
          </body>
        </html>
      `;

      const win = window.open("", "_blank", "width=900,height=700");
      if (!win) throw new Error("Popup blocked. Allow popups to print your PDF.");
      win.document.write(html);
      win.document.close();
      win.focus();
      win.print();
      toast.success("PDF ready. Print dialog opened.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate PDF.");
    }
  };

  if (loading) return <p className="text-base text-gray-700">Loading activity...</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className={adminPageShellClass}>
      <div className={adminPageHeroClass}>
        <div className={`${adminPageHeroInnerClass} flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between`}>
          <div className="min-w-0 flex-1">
            <div className={adminEyebrowClass}>Activity Insights</div>
            <h1 className={adminPageTitleClass}>Member Activity Report</h1>
            <p className={adminPageDescriptionClass}>Analyze member activity, earned points, and engagement levels with the same reporting language used across analytics.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
            <button
              onClick={downloadStatement}
              className={adminPrimaryButtonClass}
            >
              Download CSV
            </button>
            <button
              onClick={downloadPdf}
              className={adminDarkButtonClass}
            >
              Download PDF
            </button>
          </div>
        </div>
      </div>

      <div className={adminPanelClass}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[#4b607f]">Start Date</span>
            <CalendarDatePicker value={startDate} onChange={handleStartDateChange} />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[#4b607f]">End Date</span>
            <CalendarDatePicker value={endDate} onChange={handleEndDateChange} />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[#4b607f]">Activity Level</span>
            <select value={activityFilter} onChange={(e) => setActivityFilter(e.target.value as typeof activityFilter)} className={`${adminSelectClass} h-[54px]`}>
              <option value="all">All Members</option>
              <option value="active">Active</option>
              <option value="warm">Warm</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-[28px] border border-[#cfe1f7] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-[1.75rem] font-semibold text-[#10213a]">Member Segmentation Builder</h2>
            <p className="mt-2 text-base text-[#5f7087]">A builder shell for live preview, logic selection, readable chips, timestamp, and duplicate-name validation.</p>
          </div>
          <div className="rounded-[22px] border border-[#dbe8f6] bg-white px-5 py-4">
            <p className="text-[0.95rem] font-semibold text-[#10213a]">Last recalculated</p>
            <p className="mt-2 text-[0.95rem] text-[#35506e]">{builderLastRecalculated}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.75fr)_360px]">
          <div className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <Label className="mb-2 inline-block">Segment name</Label>
                <Input value={builderSegmentName} onChange={(e) => setBuilderSegmentName(e.target.value)} />
                <p className="mt-2 text-sm font-medium text-[#c2410c]">A segment with this name already exists.</p>
              </div>
              <div className="space-y-2">
                <Label className="block">Logic mode</Label>
                <div className="inline-flex rounded-full border border-[#d6e0f7] bg-[#f4f8ff] p-1">
                  {(["AND", "OR"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setBuilderLogicMode(mode)}
                      className={`rounded-full px-7 py-3 text-sm font-semibold transition ${
                        builderLogicMode === mode
                          ? mode === "OR"
                            ? "bg-[#7c3aed] text-white"
                            : "bg-[#0f7f88] text-white"
                          : "text-[#4f6580]"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {builderConditions.map((condition) => (
                <div key={condition.id} className="rounded-[24px] border border-[#dbe8f6] bg-[#fbfdff] p-5">
                  <div className="grid gap-4 lg:grid-cols-3 lg:items-end">
                    <div>
                      <Label className="mb-2 inline-block">Field</Label>
                      <Input value={condition.field} onChange={(e) => setBuilderConditions((prev) => prev.map((item) => item.id === condition.id ? { ...item, field: e.target.value } : item))} />
                    </div>
                    <div>
                      <Label className="mb-2 inline-block">Operator</Label>
                      <Input value={condition.operator} onChange={(e) => setBuilderConditions((prev) => prev.map((item) => item.id === condition.id ? { ...item, operator: e.target.value } : item))} />
                    </div>
                    <div>
                      <Label className="mb-2 inline-block">Value</Label>
                      <Input value={condition.value} onChange={(e) => setBuilderConditions((prev) => prev.map((item) => item.id === condition.id ? { ...item, value: e.target.value } : item))} />
                    </div>
                  </div>
                  <div className="mt-5">
                    <span className="inline-flex rounded-full bg-[#172845] px-6 py-3 text-lg font-semibold text-white">
                      {condition.field} {condition.operator} {condition.value}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[28px] border border-[#bfe8d8] bg-[linear-gradient(180deg,#f3fffb_0%,#ecfbf5_100%)] p-6">
              <h3 className="text-lg font-semibold text-[#0d6070]">Live member count preview</h3>
              <p className="mt-2 text-sm text-[#447486]">Debounced preview updates within the builder shell.</p>
              <p className="mt-8 text-6xl font-semibold leading-none text-[#172845]">{builderPreviewCount}</p>
              <p className="mt-4 text-base text-[#447486]">Members currently matching this rule set</p>
            </div>

            <div className="rounded-[28px] border border-[#dbe8f6] bg-white p-6">
              <h3 className="text-lg font-semibold text-[#10213a]">Condition chips</h3>
              <div className="mt-5 flex flex-wrap gap-3">
                {builderConditions.map((condition) => (
                  <span key={`chip-${condition.id}`} className="rounded-full border border-[#d6e0f7] bg-[#f8fbff] px-5 py-3 text-base text-[#10213a]">
                    {condition.field} {condition.operator} {condition.value}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={adminPanelClass}>
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Points Earned Per Month</h2>
          <p className="text-sm text-gray-500 mb-4">Monthly earned points shown as a trend line for easier month-to-month comparison.</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={earnedPointsTrend} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="#dbe8f6" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#5b6475", fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#5b6475", fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 16, borderColor: "#dbe8f6" }}
                  formatter={(value: number) => [`${value} pts`, "Earned"]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  name="Earned"
                  stroke="#00A3AD"
                  strokeWidth={3}
                  dot={{ r: 3, strokeWidth: 2, fill: "#ffffff" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={adminPanelClass}>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Activity Segmentation</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {metrics.memberSegments.map((segment) => (
              <div key={segment.label} className="rounded-lg border border-gray-200 p-4">
                <p className="text-sm text-gray-500">{segment.label}</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{segment.count}</p>
              </div>
            ))}
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={metrics.memberSegments.map((segment) => ({ name: segment.label, value: segment.count }))} dataKey="value" outerRadius={90}>
                  <Cell fill="#1A2B47" />
                  <Cell fill="#00A3AD" />
                  <Cell fill="#f59e0b" />
                </Pie>
                <Tooltip formatter={(value: number) => [`${value} members`, ""]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className={adminPanelClass}>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Active vs Inactive Members</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={adminPanelSoftClass}>
            <p className="text-sm text-gray-500">Active</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {metrics.memberActivityRows.filter((row) => row.activityLevel === "active").length}
            </p>
          </div>
          <div className={adminPanelSoftClass}>
            <p className="text-sm text-gray-500">Warm</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {metrics.memberActivityRows.filter((row) => row.activityLevel === "warm").length}
            </p>
          </div>
          <div className={adminPanelSoftClass}>
            <p className="text-sm text-gray-500">Inactive</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {metrics.memberActivityRows.filter((row) => row.activityLevel === "inactive").length}
            </p>
          </div>
        </div>
      </div>

      <div className={adminPanelClass}>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Member Activity Details</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Member #</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Member Name</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Last Activity</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Activity Level</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Points Earned</th>
              </tr>
            </thead>
            <tbody>
              {filteredActivityRows.map((row) => (
                <tr key={row.memberNumber} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-4 px-4 text-sm font-medium text-gray-800">{row.memberNumber}</td>
                  <td className="py-4 px-4 text-sm text-gray-700">{row.fullName}</td>
                  <td className="py-4 px-4 text-sm text-gray-700">
                    {row.lastActivityDate ? new Date(row.lastActivityDate).toLocaleString() : "No activity"}
                  </td>
                  <td className="py-4 px-4 text-sm">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      row.activityLevel === "active"
                        ? "bg-[#dcfce7] text-[#15803d]"
                        : row.activityLevel === "warm"
                        ? "bg-[#fff7ed] text-[#c2410c]"
                        : "bg-[#f5f0ff] text-[#7e22ce]"
                    }`}>
                      {row.activityLevel}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-sm font-semibold text-gray-800">{row.earnedPoints.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredActivityRows.length === 0 ? <p className="py-6 text-gray-500">No members match the selected activity level.</p> : null}
        </div>
      </div>

      <div className={adminPanelClass}>
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Filtered Transactions</h2>
            <p className="mt-1 text-sm text-gray-500">Use quick filters to focus on earned, redeemed, or adjustment activity in the selected date range.</p>
            <p className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-[#6a7a92]">
              Showing {visibleTransactions.length} of {filteredTransactions.length} transactions
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[420px]">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#6a7a92]">Transaction Type</span>
              <select
                value={transactionFilter}
                onChange={(e) => setTransactionFilter(e.target.value as TransactionQuickFilter)}
                className={adminSelectClass}
              >
                {transactionFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} ({option.count})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#6a7a92]">Quick Range</span>
              <select
                value={transactionRangePreset}
                onChange={(e) => applyRangePreset(e.target.value as TransactionRangePreset)}
                className={adminSelectClass}
              >
                <option value="custom">Custom Range</option>
                <option value="today">Today</option>
                <option value="last7">Last 7 Days</option>
                <option value="last30">Last 30 Days</option>
                <option value="thisMonth">This Month</option>
              </select>
            </label>
          </div>
        </div>
        {(transactionFilter !== "all" || transactionRangePreset !== "custom") ? (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#eef5ff] px-3 py-1 text-xs font-semibold text-[#48607d]">
              {transactionFilterOptions.find((option) => option.value === transactionFilter)?.label || "All"}
            </span>
            {transactionRangePreset !== "custom" ? (
              <span className="rounded-full bg-[#eef5ff] px-3 py-1 text-xs font-semibold text-[#48607d]">
                {transactionRangePreset === "today"
                  ? "Today"
                  : transactionRangePreset === "last7"
                  ? "Last 7 Days"
                  : transactionRangePreset === "last30"
                  ? "Last 30 Days"
                  : "This Month"}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setTransactionFilter("all");
                setTransactionRangePreset("custom");
              }}
              className="rounded-full border border-[#d6e0f7] bg-white px-3 py-1 text-xs font-semibold text-[#1A2B47] transition hover:border-[#b8cceb] hover:bg-[#f8fbff]"
            >
              Reset transaction filters
            </button>
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Date</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Member #</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Member Name</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Type</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Points</th>
              </tr>
            </thead>
            <tbody>
              {visibleTransactions.map((tx, index) => (
                <tr key={tx.transaction_id || `${tx.member_id}-${tx.transaction_date}-${index}`} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-4 px-4 text-sm text-gray-700">{tx.transaction_date ? new Date(tx.transaction_date).toLocaleDateString() : "-"}</td>
                  <td className="py-4 px-4 text-sm font-medium text-gray-800">{tx.loyalty_members?.member_number || "N/A"}</td>
                  <td className="py-4 px-4 text-sm text-gray-700">
                    {tx.loyalty_members
                      ? `${tx.loyalty_members.first_name} ${tx.loyalty_members.last_name}`
                      : "Unknown"}
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-700">{tx.transaction_type}</td>
                  <td className="py-4 px-4 text-sm font-semibold text-gray-800">{tx.points.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleTransactions.length === 0 ? <p className="py-6 text-gray-500">No transactions match the current date range and quick filter.</p> : null}
        </div>
      </div>
    </div>
  );
}
