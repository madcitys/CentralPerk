import React, { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, Line, LineChart, LabelList, Area, AreaChart } from "recharts";
import { Calendar, ChevronDown, Download, Search, Filter, Mail, Bell, Gift, ArrowRight, TrendingUp, Users, AlertCircle, PieChart as PieChartIcon, Target, MapPin, Zap, RefreshCw, X, ShieldCheck, UserCheck, CheckCircle2, ChevronRight, CalendarDays, SlidersHorizontal } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { AdminDashboardOutletContext } from "../types";
import { useAdminData } from "../hooks/use-admin-data";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from "../../../components/ui/dialog";
import { cn } from "../../../components/ui/utils";
import { adminPageShellClass } from "../lib/page-theme";

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

const builderFieldOptions = ["Tier", "Last Activity", "Points Balance"];
const builderOperatorOptions: Record<string, string[]> = {
  Tier: ["is", "is not"],
  "Last Activity": ["is within", "is older than"],
  "Points Balance": ["is", "is above", "is below"],
};

const ACTIVITY_PAGE_SIZE = 10;

type BuilderCondition = {
  id: string;
  field: "Tier" | "Last Activity" | "Points Balance" | string;
  operator: string;
  value: string;
};

function formatBuilderChip(field: string, operator: string, value: string) {
  if (field === "Last Activity" && operator === "is within") {
    return `${field} ${operator} ${value} days`;
  }
  return `${field} ${operator} ${value}`;
}

function formatHeaderRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "Select dates";
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} - ${end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function DateRangeSelector(props: {
  startDate: string;
  endDate: string;
  onApply: (startDate: string, endDate: string) => void;
}) {
  const { startDate, endDate, onApply } = props;
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(startDate);
  const [draftEnd, setDraftEnd] = useState(endDate);

  useEffect(() => {
    if (!open) return;
    setDraftStart(startDate);
    setDraftEnd(endDate);
  }, [open, startDate, endDate]);

  const invalid = !draftStart || !draftEnd;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-md border border-[#dfe7f1] bg-white px-3 text-[12px] font-bold text-[#24364f] shadow-[0_4px_12px_rgba(17,38,60,0.04)] transition hover:border-[#bfd0e6] hover:bg-[#f9fbff]"
      >
        <CalendarDays className="h-4 w-4 text-[#0f766e]" />
        <span>{formatHeaderRange(startDate, endDate)}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose activity date range</DialogTitle>
            <DialogDescription>Select the reporting window used across member activities.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-[#233b5d]">Start date</span>
              <input type="date" value={draftStart} onChange={(event) => setDraftStart(event.target.value)} className="flex h-10 w-full rounded-md border border-[#dfe7f1] bg-white px-3 py-2 text-sm text-[#18263b] shadow-[0_2px_8px_rgba(17,38,60,0.04)] outline-none transition focus:border-[#0b8b95] focus:ring-1 focus:ring-[#0b8b95]" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[#233b5d]">End date</span>
              <input type="date" value={draftEnd} onChange={(event) => setDraftEnd(event.target.value)} className="flex h-10 w-full rounded-md border border-[#dfe7f1] bg-white px-3 py-2 text-sm text-[#18263b] shadow-[0_2px_8px_rgba(17,38,60,0.04)] outline-none transition focus:border-[#0b8b95] focus:ring-1 focus:ring-[#0b8b95]" />
            </label>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setOpen(false)} className="inline-flex h-10 items-center justify-center rounded-lg border border-[#c3d3e5] bg-white px-4 text-[13px] font-bold text-[#354860] shadow-[0_2px_10px_rgba(17,38,60,0.03)] transition-all hover:bg-[#f8fafe] hover:text-[#18263b] focus:outline-none focus:ring-2 focus:ring-[#0b8b95] focus:ring-offset-2">
              Cancel
            </button>
            <button
              type="button"
              disabled={invalid}
              onClick={() => {
                if (invalid) return;
                onApply(draftStart, draftEnd);
                setOpen(false);
              }}
              className={cn("inline-flex h-10 items-center justify-center rounded-lg bg-[#0b7f88] px-4 text-[13px] font-bold text-white shadow-[0_4px_12px_rgba(11,127,136,0.25)] transition-all hover:bg-[#096d75] hover:shadow-[0_4px_14px_rgba(11,127,136,0.35)] focus:outline-none focus:ring-2 focus:ring-[#0b8b95] focus:ring-offset-2", invalid && "cursor-not-allowed opacity-60")}
            >
              Apply range
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function KPICard({ title, value, trend, trendLabel, color, isPositive }: any) {
  return (
    <div className="bg-white rounded-[16px] border border-[#e5e7eb] p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow group cursor-default">
      <div className="flex justify-between items-start mb-2">
        <h4 className="text-[12px] font-bold text-[#6b7280] group-hover:text-[#374151] transition-colors">{title}</h4>
        <div className={`text-[11px] font-bold flex items-center gap-1 bg-opacity-10 px-1.5 py-0.5 rounded ${isPositive ? 'text-[#059669] bg-[#ecfdf5]' : 'text-[#dc2626] bg-[#fef2f2]'}`}>
          {isPositive ? '↑' : '↓'} {trend}
        </div>
      </div>
      <div className="flex justify-between items-end mt-2">
        <div>
          <div className="text-[22px] font-extrabold text-[#1f2937] leading-none mb-1 tracking-tight">{value}</div>
          <div className="text-[10px] font-medium text-[#9ca3af]">{trendLabel}</div>
        </div>
      </div>
    </div>
  );
}

function LiveActivityFeed({ transactions }: { transactions: any[] }) {
  const recentTx = [...transactions].sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()).slice(0, 15);
  
  return (
    <div className="bg-white rounded-[20px] border border-[#e5e7eb] shadow-sm flex flex-col h-[420px]">
      <div className="px-5 py-4 border-b border-[#e5e7eb]">
        <h3 className="text-[14px] font-bold text-[#1f2937] flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#0b7f88]" />
          Live Activity Stream
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-1">
          {recentTx.length > 0 ? recentTx.map((tx) => {
            const isEarn = tx.points > 0 || tx.transaction_type === "EARN";
            const icon = isEarn ? <Gift className="w-4 h-4 text-white" /> : <Target className="w-4 h-4 text-white" />;
            const bgColor = isEarn ? "bg-[#0b7f88]" : "bg-[#f59e0b]";
            const actionText = isEarn ? `earned ${tx.points} points` : `redeemed ${Math.abs(tx.points)} points`;
            
            return (
              <div key={tx.transaction_id || Math.random()} className="flex items-start gap-3 p-3 hover:bg-[#f9fafb] rounded-xl transition-colors cursor-pointer group">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${bgColor}`}>
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-[#1f2937] truncate">
                    <span className="font-bold text-[#0b7f88] group-hover:underline">{tx.loyalty_members?.first_name || "Member"} {tx.loyalty_members?.last_name?.[0] || ""}</span> {actionText}
                  </p>
                  <p className="text-[10px] font-medium text-[#9ca3af] mt-0.5">{new Date(tx.transaction_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            );
          }) : (
            <p className="text-center text-xs text-gray-500 py-8">No recent activity.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function InsightsPanel() {
  return (
    <div className="bg-white rounded-[20px] border border-[#e5e7eb] shadow-sm flex flex-col h-[420px]">
      <div className="px-5 py-4 border-b border-[#e5e7eb]">
        <h3 className="text-[14px] font-bold text-[#1f2937] flex items-center gap-2">
          <Target className="w-4 h-4 text-[#0b7f88]" />
          Activity Insights
        </h3>
      </div>
      <div className="flex flex-col gap-3 flex-1 overflow-y-auto p-4">
        <div className="bg-[#fef2f2] border border-[#fecaca] rounded-[12px] p-3 shadow-sm">
          <p className="text-[12px] font-bold text-[#b91c1c]">82% of Gold members inactive for 14+ days</p>
          <p className="text-[10px] font-medium text-[#ef4444] mt-1">High churn risk detected.</p>
        </div>
        <div className="bg-[#ecfdf5] border border-[#a7f3d0] rounded-[12px] p-3 shadow-sm">
          <p className="text-[12px] font-bold text-[#047857]">Redemption activity increased 22%</p>
          <p className="text-[10px] font-medium text-[#10b981] mt-1">Driven by weekend double points.</p>
        </div>
        <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-[12px] p-3 shadow-sm">
          <p className="text-[12px] font-bold text-[#1d4ed8]">5 members near tier upgrade</p>
          <p className="text-[10px] font-medium text-[#3b82f6] mt-1">Action: send push notification.</p>
        </div>
        <div className="bg-[#fff7ed] border border-[#fed7aa] rounded-[12px] p-3 shadow-sm">
          <p className="text-[12px] font-bold text-[#c2410c]">Engagement dropped this week</p>
          <p className="text-[10px] font-medium text-[#f97316] mt-1">-8% logins compared to last week.</p>
        </div>
        <div className="bg-[#fef2f2] border border-[#fecaca] rounded-[12px] p-3 shadow-sm">
          <p className="text-[12px] font-bold text-[#b91c1c]">Dormant users increased by 8%</p>
          <p className="text-[10px] font-medium text-[#ef4444] mt-1">1,204 users entered dormant phase.</p>
        </div>
      </div>
    </div>
  );
}

function TabbedAnalytics({ data, renderLastLabel }: any) {
  const [tab, setTab] = useState("Engagement");
  const tabs = ["Engagement", "Transactions", "Points", "Redemptions", "Retention"];
  
  return (
    <div className="bg-white rounded-[20px] border border-[#e5e7eb] shadow-sm flex flex-col h-[420px]">
      <div className="flex border-b border-[#e5e7eb] px-5 pt-4 gap-6 overflow-x-auto">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`pb-3 text-[13px] font-bold border-b-2 transition-colors whitespace-nowrap ${tab === t ? "border-[#0b7f88] text-[#0b7f88]" : "border-transparent text-[#6b7280] hover:text-[#1f2937]"}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 p-5 flex flex-col min-h-0">
        <div className="mb-2 flex items-center justify-between">
           <div className="inline-flex items-center gap-2 text-[11px] font-semibold text-[#52627a]">
             <span className="h-1.5 w-7 rounded-full bg-[#0b7f88]" />
             {tab} Trend
           </div>
        </div>
        <div className="flex-1 w-full min-h-0 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 66, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0b7f88" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#0b7f88" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 12, borderColor: "#e5e7eb", fontSize: 12, fontWeight: 600, padding: "8px 12px" }}
                formatter={(value: number) => [`${value.toLocaleString()}`, tab]}
                labelStyle={{ color: "#6b7280", marginBottom: "4px" }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name={tab}
                stroke="#0b7f88"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorValue)"
                activeDot={{ r: 6, fill: "#0b7f88", stroke: "#fff", strokeWidth: 2 }}
              >
                <LabelList dataKey="value" content={renderLastLabel("#0b7f88")} />
              </Area>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function AdminActivityPage() {
  const { notificationCount = 0, openNotifications } = useOutletContext<AdminDashboardOutletContext>();
  const { transactions, loading, error, metrics } = useAdminData();
  const [activityFilter, setActivityFilter] = useState<"all" | "active" | "warm" | "inactive">("all");
  const [transactionFilter, setTransactionFilter] = useState<TransactionQuickFilter>("all");
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 6);
    return toInputDate(date);
  });
  const [endDate, setEndDate] = useState(() => toInputDate(new Date()));
  
  const [activeTab, setActiveTab] = useState<"details" | "transactions">("details");
  const [segmentBuilderOpen, setSegmentBuilderOpen] = useState(false);
  const [tableFiltersOpen, setTableFiltersOpen] = useState(false);
  const [activityPage, setActivityPage] = useState(1);
  const [selectedActivityRow, setSelectedActivityRow] = useState<(typeof metrics.memberActivityRows)[number] | null>(null);

  const [builderSegmentName, setBuilderSegmentName] = useState("Gold reactivation test");
  const [builderLogicMode, setBuilderLogicMode] = useState<"AND" | "OR">("AND");
  const [builderPreviewCount, setBuilderPreviewCount] = useState(1);
  const [builderLastRecalculated, setBuilderLastRecalculated] = useState(() => new Date().toLocaleString());
  const [builderConditions, setBuilderConditions] = useState<BuilderCondition[]>([
    { id: "tier", field: "Tier", operator: "is", value: "Gold" },
    { id: "activity", field: "Last Activity", operator: "is within", value: "30" },
  ]);

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
      const typeMatches =
        transactionFilter === "all" ||
        classifyTransactionType(tx.transaction_type, Number(tx.points || 0)) === transactionFilter;
      return timestamp >= start && timestamp <= end && typeMatches;
    });
  }, [transactions, startDate, endDate, transactionFilter]);

  const filteredActivityRows = useMemo(
    () =>
      metrics.memberActivityRows.filter((row) =>
        activityFilter === "all" ? true : row.activityLevel === activityFilter
      ),
    [metrics.memberActivityRows, activityFilter]
  );

  useEffect(() => {
    setActivityPage(1);
  }, [activityFilter, startDate, endDate]);

  const activityTotalPages = Math.max(1, Math.ceil(filteredActivityRows.length / ACTIVITY_PAGE_SIZE));
  const safeActivityPage = Math.min(activityPage, activityTotalPages);
  const paginatedActivityRows = filteredActivityRows.slice(
    (safeActivityPage - 1) * ACTIVITY_PAGE_SIZE,
    safeActivityPage * ACTIVITY_PAGE_SIZE
  );

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

    return Object.values(Object.fromEntries(monthlyTotals.entries()));
  }, [endDate, filteredTransactions, startDate]);

  const lastIndex = Math.max(0, earnedPointsTrend.length - 1);
  const renderLastLabel = (fill: string) => (labelProps: unknown) => {
    const { x, y, value, index } = labelProps as { x?: number; y?: number; value?: number; index?: number };
    if (index !== lastIndex || typeof x !== "number" || typeof y !== "number") return null;
    const text = Number(value || 0).toLocaleString();

    return (
      <g>
        <rect x={x + 8} y={y - 12} width={50} height={22} rx={4} fill={fill} />
        <text x={x + 33} y={y + 3} textAnchor="middle" fontSize={11} fontWeight={700} fill="#ffffff">
          {text}
        </text>
      </g>
    );
  };
  
  const realKpis = useMemo(() => {
    let earned = 0;
    let redeemed = 0;
    let maxTx = 0;
    
    for (const tx of filteredTransactions) {
      if (tx.points > 0) earned += tx.points;
      if (tx.points < 0) redeemed += Math.abs(tx.points);
      if (Math.abs(tx.points) > maxTx) maxTx = Math.abs(tx.points);
    }
    
    let active = 0;
    let warm = 0;
    let dormant = 0;
    
    for (const m of metrics.memberActivityRows) {
      if (m.activityLevel === "active") active++;
      else if (m.activityLevel === "warm") warm++;
      else if (m.activityLevel === "inactive") dormant++;
    }
    
    const avg = filteredTransactions.length > 0 ? Math.round((earned + redeemed) / filteredTransactions.length) : 0;
    
    return {
      totalTx: filteredTransactions.length,
      earned,
      redeemed,
      active,
      warm,
      dormant,
      maxTx,
      avg
    };
  }, [filteredTransactions, metrics.memberActivityRows]);

  const downloadStatement = () => {
    if (filteredTransactions.length === 0) {
      toast.error("No transactions available for the selected range.");
      return;
    }

    const header = "Date,Member Number,Member Name,Type,Points\n";
    const rows = filteredTransactions
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
    toast.success("Activity CSV exported.");
  };

  const downloadPdf = () => {
    try {
      if (filteredTransactions.length === 0) {
        toast.error("No activity available to export.");
        return;
      }

      const htmlRows = filteredTransactions
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
            <title>GREENOVATE Admin Activity Report</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
              .brand { display:flex; justify-content:space-between; align-items:center; background:#1A2B47; color:#fff; padding:12px 16px; border-radius:8px; }
              table { width: 100%; border-collapse: collapse; margin-top: 12px; }
              th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 12px; }
              th { background: #f3f4f6; }
            </style>
          </head>
          <body>
            <div class="brand"><strong>GREENOVATE Rewards</strong><span>Admin Activity Report</span></div>
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
    <div className={cn(adminPageShellClass, "mx-auto max-w-[1180px] space-y-3 px-3 py-2 pb-5")}>
      <header className="rounded-[16px] border border-[#d9e8f6] bg-[linear-gradient(135deg,#ffffff_0%,#f3fbff_48%,#eef8ff_100%)] px-5 py-5 shadow-[0_14px_32px_rgba(17,38,60,0.07)] mb-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-[#cbe4f6] bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#0b7f88] mb-3">
              Activity Insights
            </div>
            <h1 className="mt-2 text-[28px] font-extrabold leading-none tracking-normal text-[#132036] sm:text-[30px]">Member Activity</h1>
            <p className="mt-2 text-[13px] font-medium text-[#5f6f86]">Monitor member transactions, points earned, and overall activity levels.</p>
          </div>

          <div className="flex shrink-0 items-center gap-2.5 self-start">
            <button
              type="button"
              onClick={() => openNotifications?.()}
              aria-label="Notifications"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d4e5f4] bg-white/80 text-[#132036] shadow-[0_8px_18px_rgba(17,38,60,0.06)] transition hover:bg-white hover:shadow-sm"
            >
              <Bell className="h-5 w-5" />
              {notificationCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-white bg-[#0b8b95] px-1 text-[10px] font-bold text-white">
                  {notificationCount > 99 ? "99+" : notificationCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>
        
        <div className="mt-5 flex flex-wrap items-center gap-3 xl:justify-end">
          <div className="flex items-center gap-2">
            <DateRangeSelector 
              startDate={startDate} 
              endDate={endDate} 
              onApply={(start, end) => { setStartDate(start); setEndDate(end); }} 
            />
          </div>
          
          <select value={activityFilter} onChange={(e) => setActivityFilter(e.target.value as typeof activityFilter)} className="block w-[140px] px-3 border border-[#dce6f2] rounded-md text-xs font-semibold bg-white text-[#15243a] h-10 shadow-sm focus:outline-none focus:ring-1 focus:ring-[#0b8b95]">
            <option value="all">All Members</option>
            <option value="active">Active</option>
            <option value="warm">Warm</option>
            <option value="inactive">Inactive</option>
          </select>
          
          <div className="flex items-center gap-3 ml-auto">
            <button onClick={downloadStatement} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#0b7f88] px-4 text-[12px] font-bold text-white shadow-[0_8px_18px_rgba(11,127,136,0.18)] transition hover:bg-[#096d75] hover:text-white">
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button onClick={downloadPdf} className="h-10 rounded-md border border-[#dfe7f1] bg-white px-4 text-[12px] font-bold text-[#24364f] shadow-[0_4px_12px_rgba(17,38,60,0.04)] transition hover:border-[#bfd0e6] hover:bg-[#f9fbfe] flex items-center justify-center gap-2">
              <Download className="w-4 h-4" />
              Export PDF
            </button>
          </div>
        </div>
      </header>

      {/* Bento Box Row 1: KPI Strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KPICard title="Total Transactions" value={realKpis.totalTx.toLocaleString()} trend="+4%" trendLabel="in period" isPositive={true} />
        <KPICard title="Points Earned" value={realKpis.earned.toLocaleString()} trend="+12%" trendLabel="in period" isPositive={true} />
        <KPICard title="Points Redeemed" value={realKpis.redeemed.toLocaleString()} trend="+8%" trendLabel="in period" isPositive={true} />
        <KPICard title="Avg Points / Tx" value={realKpis.avg.toLocaleString()} trend="-2%" trendLabel="in period" isPositive={false} />
        
        <KPICard title="Active Members" value={realKpis.active.toLocaleString()} trend="+5%" trendLabel="total active" isPositive={true} />
        <KPICard title="Warm Members" value={realKpis.warm.toLocaleString()} trend="+2%" trendLabel="total warm" isPositive={true} />
        <KPICard title="Dormant Members" value={realKpis.dormant.toLocaleString()} trend="-1%" trendLabel="total inactive" isPositive={false} />
        <KPICard title="Highest Tx" value={realKpis.maxTx.toLocaleString()} trend="Peak" trendLabel="single transaction" isPositive={true} />
      </div>

      {/* Bento Box Row 2: Feed, Analytics, Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        <div className="lg:col-span-3">
          <LiveActivityFeed transactions={filteredTransactions} />
        </div>
        <div className="lg:col-span-6">
          <TabbedAnalytics data={earnedPointsTrend} renderLastLabel={renderLastLabel} />
        </div>
        <div className="lg:col-span-3">
          <InsightsPanel />
        </div>
      </div>

      {/* Row 3: Enhanced Activity Monitor Table */}
      <div className="bg-white rounded-[20px] border border-[#e5e7eb] shadow-sm flex flex-col min-h-[500px]">
        <div className="px-6 py-5 border-b border-[#e5e7eb] flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-[20px]">
          <h3 className="text-[16px] font-bold text-[#1f2937] flex items-center gap-2">
            <Users className="w-5 h-5 text-[#0b7f88]" />
            Activity Monitor Table
          </h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTableFiltersOpen((open) => !open)}
              className="px-4 py-2 border border-[#e5e7eb] rounded-lg text-[13px] font-bold text-[#4b5563] hover:bg-[#f9fafb] transition-colors"
            >
              Filters
            </button>
            <button
              type="button"
              onClick={downloadStatement}
              className="px-4 py-2 bg-[#0b7f88] rounded-lg text-[13px] font-bold text-white hover:bg-[#096d75] transition-colors shadow-sm"
            >
              Export Data
            </button>
          </div>
        </div>

        {tableFiltersOpen ? (
          <div className="grid gap-3 border-b border-[#e5e7eb] bg-[#fbfdff] px-6 py-4 md:grid-cols-4">
            <label className="text-[11px] font-black uppercase tracking-widest text-[#6b7280]">
              Engagement
              <select
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value as typeof activityFilter)}
                className="mt-2 h-10 w-full rounded-lg border border-[#dce6f2] bg-white px-3 text-[13px] font-bold normal-case tracking-normal text-[#1f2937] focus:outline-none focus:ring-2 focus:ring-[#0b7f88]/20"
              >
                <option value="all">All members</option>
                <option value="active">Active</option>
                <option value="warm">Warm</option>
                <option value="inactive">Dormant</option>
              </select>
            </label>
            <label className="text-[11px] font-black uppercase tracking-widest text-[#6b7280]">
              Transaction Type
              <select
                value={transactionFilter}
                onChange={(e) => setTransactionFilter(e.target.value as TransactionQuickFilter)}
                className="mt-2 h-10 w-full rounded-lg border border-[#dce6f2] bg-white px-3 text-[13px] font-bold normal-case tracking-normal text-[#1f2937] focus:outline-none focus:ring-2 focus:ring-[#0b7f88]/20"
              >
                <option value="all">All activity</option>
                <option value="earned">Earned points</option>
                <option value="redeemed">Redeemed points</option>
                <option value="other">Other adjustments</option>
              </select>
            </label>
            <label className="text-[11px] font-black uppercase tracking-widest text-[#6b7280]">
              Start Date
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-2 h-10 w-full rounded-lg border border-[#dce6f2] bg-white px-3 text-[13px] font-bold normal-case tracking-normal text-[#1f2937] focus:outline-none focus:ring-2 focus:ring-[#0b7f88]/20"
              />
            </label>
            <label className="text-[11px] font-black uppercase tracking-widest text-[#6b7280]">
              End Date
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-2 h-10 w-full rounded-lg border border-[#dce6f2] bg-white px-3 text-[13px] font-bold normal-case tracking-normal text-[#1f2937] focus:outline-none focus:ring-2 focus:ring-[#0b7f88]/20"
              />
            </label>
          </div>
        ) : null}
        
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#f9fafb] z-10 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <tr>
                <th className="px-6 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-[#6b7280]">Member</th>
                <th className="px-6 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-[#6b7280]">Tier</th>
                <th className="px-6 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-[#6b7280]">Score</th>
                <th className="px-6 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-[#6b7280]">Engagement</th>
                <th className="px-6 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-[#6b7280]">Last Active</th>
                <th className="px-6 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-[#6b7280] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e7eb]">
              {paginatedActivityRows.map((row, i) => {
                const rowIndex = (safeActivityPage - 1) * ACTIVITY_PAGE_SIZE + i;
                return (
                <tr key={row.memberNumber} className="hover:bg-[#fbfdff] transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-[13px] font-bold text-[#1f2937] group-hover:text-[#0b7f88] transition-colors">{row.fullName}</span>
                      <span className="text-[11px] font-medium text-[#6b7280]">#{row.memberNumber}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-widest bg-[#fef3c7] text-[#92400e] border border-[#fde68a]">
                      Gold
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[14px] font-bold text-[#1f2937] leading-none">{Math.max(62, 95 - rowIndex * 3)}</span>
                      <span className="text-[10px] font-bold text-[#059669] flex items-center">+2.1</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                      row.activityLevel === "active" ? "bg-[#ecfdf5] text-[#059669] border-[#a7f3d0]" :
                      row.activityLevel === "warm" ? "bg-[#fffbeb] text-[#d97706] border-[#fde68a]" :
                      "bg-[#fef2f2] text-[#dc2626] border-[#fecaca]"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                        row.activityLevel === "active" ? "bg-[#059669]" :
                        row.activityLevel === "warm" ? "bg-[#d97706]" :
                        "bg-[#dc2626]"
                      }`}></span>
                      {row.activityLevel === "inactive" ? "Dormant" : row.activityLevel.charAt(0).toUpperCase() + row.activityLevel.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[12px] font-medium text-[#4b5563]">
                    {row.lastActivityDate ? new Date(row.lastActivityDate).toLocaleDateString() : "No activity"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      type="button"
                      aria-label={`Open ${row.fullName}`}
                      onClick={() => setSelectedActivityRow(row)}
                      className="p-1.5 text-[#9ca3af] hover:text-[#0b7f88] hover:bg-[#e0f2fe] rounded-md transition-colors inline-flex"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
                );
              })}
              {filteredActivityRows.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-[13px] font-medium text-[#6b7280]">No members match the criteria.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-[#e5e7eb] flex items-center justify-between bg-[#f9fafb] rounded-b-[20px]">
          <p className="text-[12px] font-medium text-[#6b7280]">
            Showing {filteredActivityRows.length ? (safeActivityPage - 1) * ACTIVITY_PAGE_SIZE + 1 : 0} to {Math.min(safeActivityPage * ACTIVITY_PAGE_SIZE, filteredActivityRows.length)} of {filteredActivityRows.length} entries
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={safeActivityPage === 1}
              onClick={() => setActivityPage((page) => Math.max(1, page - 1))}
              className="px-3 py-1.5 border border-[#d1d5db] rounded-lg text-[12px] font-bold bg-white text-[#4b5563] hover:bg-[#f3f4f6] disabled:opacity-50"
            >
              Prev
            </button>
            <span className="px-3 py-1.5 border border-[#d1d5db] rounded-lg text-[12px] font-bold bg-[#0b7f88] text-white shadow-sm">{safeActivityPage}</span>
            <span className="px-3 py-1.5 border border-[#d1d5db] rounded-lg text-[12px] font-bold bg-white text-[#4b5563]">{activityTotalPages}</span>
            <button
              type="button"
              disabled={safeActivityPage >= activityTotalPages}
              onClick={() => setActivityPage((page) => Math.min(activityTotalPages, page + 1))}
              className="px-3 py-1.5 border border-[#d1d5db] rounded-lg text-[12px] font-bold bg-white text-[#4b5563] hover:bg-[#f3f4f6] disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(selectedActivityRow)} onOpenChange={(open) => !open && setSelectedActivityRow(null)}>
        <DialogContent className="max-w-[560px] rounded-[20px] border border-[#dbe7f3] bg-white p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-[20px] font-black text-[#061e3b]">Member Activity Detail</DialogTitle>
            <DialogDescription className="text-sm font-medium text-[#64748b]">
              Review current engagement status and choose the next admin action.
            </DialogDescription>
          </DialogHeader>
          {selectedActivityRow ? (
            <div className="space-y-4">
              <div className="rounded-[14px] border border-[#e5edf6] bg-[#f8fbff] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-black text-[#061e3b]">{selectedActivityRow.fullName}</p>
                    <p className="mt-1 text-xs font-bold text-[#64748b]">#{selectedActivityRow.memberNumber}</p>
                  </div>
                  <span className={cn(
                    "rounded-full px-3 py-1 text-xs font-black capitalize",
                    selectedActivityRow.activityLevel === "active" ? "bg-[#dcfce7] text-[#15803d]" :
                    selectedActivityRow.activityLevel === "warm" ? "bg-[#fff7ed] text-[#c2410c]" :
                    "bg-[#fee2e2] text-[#b91c1c]"
                  )}>
                    {selectedActivityRow.activityLevel === "inactive" ? "Dormant" : selectedActivityRow.activityLevel}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-white p-3">
                    <p className="text-[11px] font-black uppercase tracking-widest text-[#64748b]">Tier</p>
                    <p className="mt-1 text-sm font-black text-[#061e3b]">Gold</p>
                  </div>
                  <div className="rounded-lg bg-white p-3">
                    <p className="text-[11px] font-black uppercase tracking-widest text-[#64748b]">Last Active</p>
                    <p className="mt-1 text-sm font-black text-[#061e3b]">{selectedActivityRow.lastActivityDate ? new Date(selectedActivityRow.lastActivityDate).toLocaleDateString() : "No activity"}</p>
                  </div>
                  <div className="rounded-lg bg-white p-3">
                    <p className="text-[11px] font-black uppercase tracking-widest text-[#64748b]">Score</p>
                    <p className="mt-1 text-sm font-black text-[#061e3b]">Admin review ready</p>
                  </div>
                </div>
              </div>
              <DialogFooter className="flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedActivityRow(null);
                    setActiveTab("transactions");
                    setTableFiltersOpen(true);
                    toast.success("Transactions filter panel opened.");
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-[#cbd9eb] bg-white px-4 text-sm font-black text-[#061e3b] hover:bg-[#f8fbff]"
                >
                  Review Transactions
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedActivityRow(null);
                    setSegmentBuilderOpen(true);
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-[#cbd9eb] bg-white px-4 text-sm font-black text-[#061e3b] hover:bg-[#f8fbff]"
                >
                  Build Segment
                </button>
                <button
                  type="button"
                  onClick={() => {
                    toast.success(`Re-engagement queued for ${selectedActivityRow.fullName}.`);
                    setSelectedActivityRow(null);
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-[#061e3b] px-4 text-sm font-black text-white hover:bg-[#0b2d56]"
                >
                  Send Re-engagement
                </button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Segmentation Builder Modal */}
      <Dialog open={segmentBuilderOpen} onOpenChange={setSegmentBuilderOpen}>
        <DialogContent className="sm:max-w-[960px] p-8 overflow-hidden border-0 bg-white rounded-[24px] shadow-2xl">
          <div className="flex justify-between items-start mb-8">
            <div className="pr-8">
              <DialogTitle className="text-[24px] font-bold text-[#1f2937] leading-tight mb-2">Member Segmentation Builder</DialogTitle>
              <DialogDescription className="text-[14px] text-[#6b7280] m-0 font-medium">A builder shell for live preview, logic selection, readable chips, timestamp, and duplicate-name validation.</DialogDescription>
            </div>
            <div className="bg-[#f9fafb] rounded-[12px] px-4 py-2.5 border border-[#e5e7eb] text-right flex-shrink-0">
              <div className="text-[10px] font-bold text-[#6b7280] mb-0.5">Last recalculated</div>
              <div className="text-[12px] font-medium text-[#4b5563]">{builderLastRecalculated}</div>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            <div className="flex-1 flex flex-col gap-6">
              <div className="flex gap-6 items-start">
                <div className="flex-1">
                  <label className="text-[13px] font-bold text-[#374151] block mb-2">Segment name</label>
                  <input type="text" className="w-full border border-[#e5e7eb] rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#059669]" placeholder="Gold reactivation test" value={builderSegmentName} onChange={(e) => setBuilderSegmentName(e.target.value)} />
                </div>
                <div>
                  <label className="text-[13px] font-bold text-[#374151] block mb-2">Logic mode</label>
                  <div className="flex rounded-full border border-[#e5e7eb] bg-white p-1">
                    <button className={cn("px-5 py-1.5 text-[13px] font-bold rounded-full transition-colors", builderLogicMode === "AND" ? "bg-[#059669] text-white" : "text-[#4b5563] hover:text-[#1f2937]")} onClick={() => setBuilderLogicMode("AND")}>AND</button>
                    <button className={cn("px-5 py-1.5 text-[13px] font-bold rounded-full transition-colors", builderLogicMode === "OR" ? "bg-[#059669] text-white" : "text-[#4b5563] hover:text-[#1f2937]")} onClick={() => setBuilderLogicMode("OR")}>OR</button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {builderConditions.map((condition) => (
                  <div key={condition.id} className="bg-white rounded-[20px] p-5 border border-[#e5e7eb] relative group">
                    <div className="flex gap-4 items-end mb-5">
                      <div className="flex-1">
                        <label className="text-[13px] font-bold text-[#374151] block mb-2">Field</label>
                        <select className="w-full border border-[#e5e7eb] rounded-[10px] px-3 py-2.5 text-[14px] bg-[#fdfdfd] focus:outline-none focus:ring-2 focus:ring-[#059669] font-medium" value={condition.field} onChange={(e) => setBuilderConditions((prev) => prev.map((item) => item.id === condition.id ? { ...item, field: e.target.value, operator: builderOperatorOptions[e.target.value]?.[0] ?? item.operator } : item))}>
                          {builderFieldOptions.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="text-[13px] font-bold text-[#374151] block mb-2">Operator</label>
                        <select className="w-full border border-[#e5e7eb] rounded-[10px] px-3 py-2.5 text-[14px] bg-[#fdfdfd] focus:outline-none focus:ring-2 focus:ring-[#059669] font-medium" value={condition.operator} onChange={(e) => setBuilderConditions((prev) => prev.map((item) => item.id === condition.id ? { ...item, operator: e.target.value } : item))}>
                          {(builderOperatorOptions[condition.field] ?? [condition.operator]).map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="text-[13px] font-bold text-[#374151] block mb-2">Value</label>
                        <div className="flex gap-2 items-center bg-[#fdfdfd] border border-[#e5e7eb] rounded-[10px] px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#059669]">
                          <input type="text" className="w-full bg-transparent text-[14px] focus:outline-none font-medium" value={condition.value} onChange={(e) => setBuilderConditions((prev) => prev.map((item) => item.id === condition.id ? { ...item, value: e.target.value } : item))} />
                          {condition.field === "Last Activity" && <span className="text-[13px] font-medium text-[#6b7280]">days</span>}
                        </div>
                      </div>
                      <button onClick={() => setBuilderConditions(prev => prev.length > 1 ? prev.filter(i => i.id !== condition.id) : prev)} className="p-2 text-[#9ca3af] hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 absolute top-3 right-3">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                      </button>
                    </div>
                    <div>
                      <span className="inline-flex rounded-full bg-[#1f2937] text-white text-[13px] font-bold px-4 py-1.5 shadow-sm">{formatBuilderChip(condition.field, condition.operator, condition.value)}</span>
                    </div>
                  </div>
                ))}
                <button className="text-[#059669] text-[14px] font-bold flex items-center gap-1.5 hover:text-[#047857] px-2 py-1 transition-colors mt-2" onClick={() => setBuilderConditions(prev => [...prev, { id: Math.random().toString(), field: "Tier", operator: "is", value: "" }])}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                  Add Condition
                </button>
              </div>
            </div>

            <div className="w-full lg:w-[320px] flex flex-col gap-6">
              <div className="bg-[#eefcf6] rounded-[24px] p-6 border border-[#d1fae5]">
                <h3 className="text-[18px] font-bold text-[#065f46] mb-2">Live member count preview</h3>
                <p className="text-[14px] font-medium text-[#059669] mb-8 leading-relaxed">Debounced preview updates within the builder shell.</p>
                <div className="text-[72px] font-extrabold text-[#1f2937] leading-none mb-3 tracking-tight">{builderPreviewCount}</div>
                <p className="text-[13px] font-medium text-[#059669]">Members currently matching this rule set</p>
              </div>

              <div className="bg-white rounded-[24px] p-6 border border-[#e5e7eb] shadow-sm">
                <h3 className="text-[15px] font-bold text-[#1f2937] mb-4">Condition chips</h3>
                <div className="flex flex-col gap-2.5">
                  {builderConditions.map((condition, idx) => (
                    <div key={idx} className="bg-[#f9fafb] border border-[#f3f4f6] rounded-[16px] px-5 py-3 text-[13px] font-medium text-[#4b5563] w-max max-w-[200px] text-left leading-snug break-words">
                      {formatBuilderChip(condition.field, condition.operator, condition.value)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center mt-8">
            <button className="text-[14px] font-bold text-red-500 hover:text-red-600 transition-colors" onClick={() => setSegmentBuilderOpen(false)}>Close Builder</button>
            <div className="flex gap-3">
              <button className="bg-[#059669] hover:bg-[#047857] text-white rounded-[10px] font-bold px-6 h-10 shadow-sm" onClick={() => {toast.success("Segment saved (preview)"); setSegmentBuilderOpen(false);}}>Save Changes</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
