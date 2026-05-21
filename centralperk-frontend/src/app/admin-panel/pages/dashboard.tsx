import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Coins,
  Gift,
  HeartPulse,
  Megaphone,
  MessageSquareText,
  Percent,
  RefreshCcw,
  Send,
  ShieldAlert,
  Share2,
  Sparkles,
  Target,
  TriangleAlert,
  Trophy,
  Users,
  UserPlus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { cn } from "../../../components/ui/utils";
import { useAdminData } from "../hooks/use-admin-data";
import {
  buildInactiveMemberInsights,
  loadChallengeDefinitions,
  loadNotificationCampaigns,
  loadSocialShareEvents,
  loadSurveyDefinitions,
  type ChallengeDefinition,
  type NotificationCampaign,
  type ShareEvent,
  type SurveyDefinition,
} from "../../lib/member-engagement";
import { loadAllReferrals, loadFeedback, type FeedbackRecord, type ReferralRecord } from "../../lib/member-lifecycle";
import { loadVouchersViaApi, loadPartnerDashboardViaApi } from "../../lib/api";
import {
  loadCampaignPerformance,
  loadPromotionCampaigns,
  type CampaignPerformance,
  type PromotionCampaign,
} from "../../lib/promotions";
import type { LoyaltyTransaction, Member, RewardCatalogRow } from "../types";
import type { RedemptionVoucher } from "../../types/voucher";
import {
  adminInputClass,
  adminOutlineButtonClass,
  adminPageShellClass,
  adminPrimaryButtonClass,
} from "../lib/page-theme";

const integerFormatter = new Intl.NumberFormat();
const compactFormatter = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});
const singleDecimalFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_COMPARISON_BASE = 10; // minimum previous value required for meaningful percent deltas

type CompareMode = "both" | "last_month" | "last_quarter";
type ComparisonKind = "percent" | "pp";
type StatusTone = "success" | "warning" | "danger" | "info";

type MemberRecord = Member & {
  key: string;
  fullName: string;
  enrollmentMs: number;
  pointsBalance: number;
};

type PeriodRange = {
  startMs: number;
  endMs: number;
};

type PeriodSummary = {
  totalMembers: number;
  activeMembers30d: number;
  pointsLiability: number;
  pointsIssued: number;
  pointsRedeemed: number;
  redemptionRate: number;
  newMembers: number;
  atRiskMembers: number;
  activeRate30d: number;
};

type TrendPoint = {
  label: string;
  totalMembers: number;
  activeMembers30d: number;
};

type EconomyPoint = {
  label: string;
  pointsIssued: number;
  pointsRedeemed: number;
};

type PerformanceRow = {
  id: string;
  name: string;
  status: string;
  redemptions: number;
  rate: number;
};

type StatusRow = {
  icon: LucideIcon;
  label: string;
  value: string;
  targetLabel: string;
  monthDelta: number;
  quarterDelta: number;
  deltaKind: ComparisonKind;
  invertComparison?: boolean;
  badgeLabel: string;
  badgeTone: StatusTone;
};

type ActionRecord = {
  primary: string;
  secondary: string;
  badge?: string;
};

type ActionCenterItem = {
  label: string;
  count: number;
  actionLabel: string;
  actionHref?: string;
  tone: "teal" | "amber" | "rose" | "violet" | "blue";
  description: string;
  emptyText: string;
  records: ActionRecord[];
};

type InsightItem = {
  title: string;
  value: string;
  supporting: string;
  caption: string;
  href?: string;
  ctaLabel?: string;
  icon: LucideIcon;
  tone: "teal" | "amber" | "rose" | "violet" | "blue";
};

type SystemSignalItem = {
  label: string;
  value: number | string;
  supporting: string;
  href: string;
  icon: LucideIcon;
  tone: "teal" | "amber" | "rose" | "violet" | "blue" | "green";
};

type AdminDashboardOutletContext = {
  notificationCount?: number;
  openNotifications?: () => void;
};

type PartnerDashboardRow = Awaited<ReturnType<typeof loadPartnerDashboardViaApi>>["partners"][number];

function toInputDate(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function normalizeDateParam(value: string | null, fallback: string) {
  if (!value || Number.isNaN(new Date(`${value}T00:00:00`).getTime())) return fallback;
  return value;
}

function normalizeCompareParam(value: string | null): CompareMode {
  if (value === "last_month" || value === "last_quarter" || value === "both") return value;
  return "both";
}

function parseTimestamp(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function parseDateInput(value: string, endOfDay = false) {
  const suffix = endOfDay ? "T23:59:59.999" : "T00:00:00.000";
  const parsed = new Date(`${value}${suffix}`).getTime();
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function formatHeaderRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} - ${end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function formatBucketLabel(startMs: number, endMs: number) {
  const start = new Date(startMs);
  const end = new Date(endMs);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();

  if (sameMonth) {
    return `${start.toLocaleDateString("en-US", { month: "short" })} ${start.getDate()}-${end.getDate()}`;
  }

  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;
}

function buildDisplayBuckets(startMs: number, endMs: number) {
  const buckets: Array<{ startMs: number; endMs: number; label: string }> = [];
  const totalDays = Math.max(1, Math.floor((endMs - startMs) / DAY_MS) + 1);
  const bucketDays = Math.max(7, Math.ceil(totalDays / 5));
  let cursor = startMs;

  while (cursor <= endMs) {
    const bucketEnd = Math.min(endMs, cursor + (bucketDays - 1) * DAY_MS);
    buckets.push({
      startMs: cursor,
      endMs: bucketEnd,
      label: formatBucketLabel(cursor, bucketEnd),
    });
    cursor = bucketEnd + DAY_MS;
  }

  return buckets;
}

function shiftRangeByMonths(range: PeriodRange, months: number): PeriodRange {
  const nextStart = new Date(range.startMs);
  const nextEnd = new Date(range.endMs);
  nextStart.setMonth(nextStart.getMonth() + months);
  nextEnd.setMonth(nextEnd.getMonth() + months);
  return { startMs: nextStart.getTime(), endMs: nextEnd.getTime() };
}

function safeRate(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

function differencePercent(current: number, previous: number) {
  // Return NaN when previous is zero or too small to make a reliable comparison.
  // This prevents huge, misleading percentage spikes from sparse or test data.
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return NaN;
  if (previous === 0) return NaN;
  if (previous < MIN_COMPARISON_BASE) return NaN;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function differencePoints(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
  return current - previous;
}

function classifyTransaction(transaction: LoyaltyTransaction) {
  const type = String(transaction.transaction_type || "").toUpperCase();
  const points = Number(transaction.points || 0);

  if (type.includes("REDEEM") || type.includes("GIFT") || points < 0) return "redeemed";
  if (type.includes("PURCHASE") || type.includes("EARN") || type.includes("AWARD") || points > 0) return "issued";
  return "other";
}

function formatSignedPercent(value: number) {
  if (!Number.isFinite(value)) return "--";
  if (value === 0) return "0.0%";
  return `${value > 0 ? "+" : ""}${singleDecimalFormatter.format(value)}%`;
}

function formatSignedPp(value: number) {
  if (!Number.isFinite(value)) return "--";
  if (value === 0) return "0.0 pp";
  return `${value > 0 ? "+" : ""}${singleDecimalFormatter.format(value)} pp`;
}

function formatCompactValue(value: number) {
  if (!Number.isFinite(value)) return "0";
  return compactFormatter.format(value);
}

function rewardStatusLabel(reward: RewardCatalogRow) {
  return reward.is_active === false ? "Inactive" : "Active";
}

function campaignStatusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function buildTargetStatus(current: number, target: number, lowerIsBetter = false) {
  if (lowerIsBetter) {
    if (current <= target) return { label: "Below Target", tone: "success" as const };
    if (current <= target * 1.1) return { label: "Slightly Above", tone: "warning" as const };
    return { label: "Needs Attention", tone: "danger" as const };
  }

  if (current >= target) return { label: "Above Target", tone: "success" as const };
  if (current >= target * 0.9) return { label: "Below Target", tone: "info" as const };
  return { label: "Needs Attention", tone: "danger" as const };
}

function toneBadgeClass(tone: StatusTone) {
  if (tone === "success") return "border-[#caefe3] bg-[#ecfff7] text-[#0f766e]";
  if (tone === "warning") return "border-[#f6e0b8] bg-[#fff7e7] text-[#b7791f]";
  if (tone === "danger") return "border-[#f3d0d4] bg-[#fff1f3] text-[#c24141]";
  return "border-[#d8e3f5] bg-[#f4f8ff] text-[#35506e]";
}

function actionToneClass(tone: ActionCenterItem["tone"]) {
  if (tone === "amber") return "bg-[#fff3dc] text-[#d08813]";
  if (tone === "rose") return "bg-[#fff0f5] text-[#e23f70]";
  if (tone === "violet") return "bg-[#f4edff] text-[#8b3dff]";
  if (tone === "blue") return "bg-[#eef6ff] text-[#1f6dff]";
  return "bg-[#e8fbfb] text-[#0b8390]";
}

function actionButtonToneClass(tone: ActionCenterItem["tone"]) {
  if (tone === "amber") return "hover:border-[#f1c46e] hover:bg-[#fff8ea]";
  if (tone === "rose") return "hover:border-[#f2abc0] hover:bg-[#fff6f9]";
  if (tone === "violet") return "hover:border-[#cab0ff] hover:bg-[#faf7ff]";
  if (tone === "blue") return "hover:border-[#a9c8ff] hover:bg-[#f6faff]";
  return "hover:border-[#9fd7dd] hover:bg-[#f4ffff]";
}

function insightToneClass(tone: InsightItem["tone"]) {
  if (tone === "amber") return "bg-[#fff7e8] text-[#b7791f]";
  if (tone === "rose") return "bg-[#fff0f3] text-[#cc4b6d]";
  if (tone === "violet") return "bg-[#f3efff] text-[#7c3aed]";
  if (tone === "blue") return "bg-[#eef6ff] text-[#2563eb]";
  return "bg-[#e9fffb] text-[#0f766e]";
}

function systemSignalToneClass(tone: SystemSignalItem["tone"]) {
  if (tone === "amber") return "border-[#f5d6a1] bg-[#fffaf0] text-[#9a6117]";
  if (tone === "rose") return "border-[#f0c6cf] bg-[#fff5f7] text-[#9b2438]";
  if (tone === "violet") return "border-[#d9cdfb] bg-[#f8f5ff] text-[#5b3fb6]";
  if (tone === "blue") return "border-[#c7daf8] bg-[#f5f9ff] text-[#1d4ed8]";
  if (tone === "green") return "border-[#bee7cf] bg-[#f4fff8] text-[#15803d]";
  return "border-[#c2e8e2] bg-[#f4fffb] text-[#0f766e]";
}

function emptyActionRecords(message: string): ActionRecord[] {
  return [{ primary: "Nothing urgent right now", secondary: message }];
}

function ComparisonLine(props: {
  value: number;
  label: string;
  kind: ComparisonKind;
  compareMode: CompareMode;
  modeKey: Exclude<CompareMode, "both">;
  invert?: boolean;
}) {
  const { value, label, kind, compareMode, modeKey, invert } = props;
  const emphasized = compareMode === "both" || compareMode === modeKey;
  const isInvalid = !Number.isFinite(value);
  const formatted = kind === "pp" ? formatSignedPp(value) : formatSignedPercent(value);

  if (isInvalid) {
    // Render a neutral fallback when the comparison is not meaningful.
    return (
      <div className={cn("flex items-center gap-1.5 text-[12px] font-medium text-[#64748b] transition-opacity", emphasized ? "opacity-100" : "opacity-55")}>
        <span className="inline-block w-3.5">--</span>
        <span className="text-[#64748b]">{formatted}</span>
        <span className="text-[#64748b]">{label}</span>
      </div>
    );
  }

  const positiveDirection = value >= 0;
  const good = invert ? value <= 0 : value >= 0;
  const Icon = positiveDirection ? ArrowUpRight : ArrowDownRight;
  const colorClass = good ? "text-[#0f8a63]" : "text-[#c24141]";

  return (
    <div className={cn("flex items-center gap-1.5 text-[12px] font-medium transition-opacity", emphasized ? "opacity-100" : "opacity-55")}>
      <Icon className={cn("h-3.5 w-3.5", colorClass)} />
      <span className={colorClass}>{formatted}</span>
      <span className="text-[#64748b]">{label}</span>
    </div>
  );
}

function StatusBadge(props: { label: string; tone: StatusTone }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold", toneBadgeClass(props.tone))}>
      {props.label}
    </span>
  );
}

function SectionCard(props: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const { icon: Icon, title, subtitle, headerRight, children, className } = props;
  return (
    <section
      className={cn(
        "flex h-full min-h-0 flex-col rounded-lg border border-[#e3eaf4] bg-white p-4 shadow-[0_8px_22px_rgba(17,38,60,0.045)]",
        className,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e7fbfb] text-[#0b7f88]">
            <Icon className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold leading-tight text-[#18263b]">{title}</h2>
            <p className="mt-0.5 text-[12px] leading-4 text-[#607087]">{subtitle}</p>
          </div>
        </div>
        {headerRight}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

function DashboardKpiCard(props: {
  icon: LucideIcon;
  title: string;
  value: string;
  monthDelta: number;
  quarterDelta: number;
  compareMode: CompareMode;
  deltaKind?: ComparisonKind;
}) {
  const { icon: Icon, title, value, monthDelta, quarterDelta, compareMode, deltaKind = "percent" } = props;
  return (
    <div className="min-h-[112px] rounded-lg border border-[#e3eaf4] bg-white p-4 shadow-[0_8px_20px_rgba(17,38,60,0.04)]">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e7fbfb] text-[#0b7f88]">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-[#24364f]">{title}</p>
          <p className="mt-1 text-[23px] font-extrabold leading-none tracking-normal text-[#15243a]">{value}</p>
        </div>
      </div>
      <div className="mt-3 space-y-1">
        <ComparisonLine value={monthDelta} label="vs last month" kind={deltaKind} compareMode={compareMode} modeKey="last_month" />
        <ComparisonLine value={quarterDelta} label="vs last quarter" kind={deltaKind} compareMode={compareMode} modeKey="last_quarter" />
      </div>
    </div>
  );
}

function ProgramHealthChart({ data, compact }: { data: TrendPoint[]; compact?: boolean }) {
  const lastIndex = Math.max(0, data.length - 1);
  const renderLastLabel = (fill: string) => (labelProps: unknown) => {
    const { x, y, value, index } = labelProps as { x?: number; y?: number; value?: number; index?: number };
    if (index !== lastIndex || typeof x !== "number" || typeof y !== "number") return null;
    const text = formatCompactValue(Number(value || 0));

    return (
      <g>
        <rect x={x + 8} y={y - 12} width={50} height={22} rx={4} fill={fill} />
        <text x={x + 33} y={y + 3} textAnchor="middle" fontSize={11} fontWeight={700} fill="#ffffff">
          {text}
        </text>
      </g>
    );
  };

  return (
    <div className={cn("flex h-full w-full flex-1 flex-col", compact ? "min-h-[210px]" : "min-h-[240px]")}>
      <div className="mb-1 flex items-center justify-center gap-8 text-[11px] font-semibold text-[#52627a]">
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-7 rounded-full bg-[#0b8b95]" />
          Total Members
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-7 rounded-full bg-[#73b943]" />
          Active Members (30d)
        </span>
      </div>
      <div className="mt-2 min-h-0 w-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 66, left: -10, bottom: 2 }}>
            <CartesianGrid stroke="#e8eef5" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#55657a", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#d7e0ec" }} />
            <YAxis tick={{ fill: "#55657a", fontSize: 11 }} tickLine={false} axisLine={false} width={42} />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                borderColor: "#d9e4f5",
                boxShadow: "0 18px 40px rgba(15,23,42,0.08)",
              }}
              formatter={(value: number, name: string) => [
                integerFormatter.format(value),
                name === "totalMembers" ? "Total Members" : "Active Members (30d)",
              ]}
            />
            <Line type="monotone" dataKey="totalMembers" stroke="#0b8b95" strokeWidth={3} dot={{ r: 3, fill: "#0b8b95", strokeWidth: 0 }}>
              <LabelList dataKey="totalMembers" content={renderLastLabel("#0b8b95")} />
            </Line>
            <Line type="monotone" dataKey="activeMembers30d" stroke="#73b943" strokeWidth={3} dot={{ r: 3, fill: "#73b943", strokeWidth: 0 }}>
              <LabelList dataKey="activeMembers30d" content={renderLastLabel("#73b943")} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ProgramHealthSummaryRow(props: StatusRow & { compareMode: CompareMode }) {
  const {
    icon: Icon,
    label,
    value,
    targetLabel,
    monthDelta,
    quarterDelta,
    deltaKind,
    invertComparison,
    badgeLabel,
    badgeTone,
    compareMode,
  } = props;

  return (
    <div className="border-b border-[#edf2f7] px-1 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e7fbfb] text-[#0b7f88]">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-[#18263b]">{label}</p>
            <p className="mt-1 text-[22px] font-extrabold leading-none tracking-normal text-[#15243a]">{value}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold text-[#52627a]">{targetLabel}</p>
          <div className="mt-2">
            <StatusBadge label={badgeLabel} tone={badgeTone} />
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-1">
        <ComparisonLine
          value={monthDelta}
          label="vs last month"
          kind={deltaKind}
          compareMode={compareMode}
          modeKey="last_month"
          invert={invertComparison}
        />
        <ComparisonLine
          value={quarterDelta}
          label="vs last quarter"
          kind={deltaKind}
          compareMode={compareMode}
          modeKey="last_quarter"
          invert={invertComparison}
        />
      </div>
    </div>
  );
}

function PointsEconomyChart({ data, compact }: { data: EconomyPoint[]; compact?: boolean }) {
  return (
    <div className={cn("flex h-full w-full flex-1 flex-col", compact ? "min-h-[190px]" : "min-h-[220px]")}>
      <div className="mb-1 flex items-center justify-center gap-8 text-[11px] font-semibold text-[#52627a]">
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-5 rounded-sm bg-[#0b8b95]" />
          Points Earned
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-5 rounded-sm bg-[#73b943]" />
          Points Redeemed
        </span>
      </div>
      <div className="mt-2 min-h-0 w-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 22, right: 8, left: -10, bottom: 2 }} barCategoryGap={22}>
            <CartesianGrid stroke="#e8eef5" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#55657a", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#d7e0ec" }} />
            <YAxis tick={{ fill: "#55657a", fontSize: 11 }} tickLine={false} axisLine={false} width={38} />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                borderColor: "#d9e4f5",
                boxShadow: "0 18px 40px rgba(15,23,42,0.08)",
              }}
              formatter={(value: number, name: string) => [
                integerFormatter.format(value),
                name === "pointsIssued" ? "Points Earned" : "Points Redeemed",
              ]}
            />
            <Bar dataKey="pointsIssued" fill="#0b8b95" radius={[3, 3, 0, 0]} barSize={22}>
              <LabelList dataKey="pointsIssued" position="top" formatter={(value: number) => formatCompactValue(value)} fill="#18263b" fontSize={11} fontWeight={700} />
            </Bar>
            <Bar dataKey="pointsRedeemed" fill="#73b943" radius={[3, 3, 0, 0]} barSize={22}>
              <LabelList dataKey="pointsRedeemed" position="top" formatter={(value: number) => formatCompactValue(value)} fill="#18263b" fontSize={11} fontWeight={700} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CampaignPerformanceChart({ data, compact }: { data: CampaignPerformance[]; compact?: boolean }) {
  const sorted = [...data]
    .sort((left, right) => right.redemptionCount - left.redemptionCount)
    .slice(0, 6)
    .map((row) => ({
      name: row.campaignName.length > 18 ? `${row.campaignName.slice(0, 18)}...` : row.campaignName,
      redemptions: row.redemptionCount,
    }));

  if (sorted.length === 0) {
    return (
      <div className="rounded-[18px] border border-[#dce8ff] bg-[#f7fbff] p-4 text-sm text-[#64748b]">
        No campaign redemption activity is available to chart yet.
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col rounded-[18px] border border-[#e8eef7] bg-[#fbfdff] p-3", compact ? "min-h-[220px]" : "min-h-[270px]")}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-[#10213d]">Top campaign redemptions</p>
        <p className="text-xs text-[#64748b]">Top 6 campaigns</p>
      </div>
      <div className="flex-1 min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sorted} margin={{ top: 10, right: 6, left: 0, bottom: 8 }} barCategoryGap={16}>
          <CartesianGrid stroke="#e6eef9" strokeDasharray="4 4" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              borderRadius: 16,
              borderColor: "#d9e4f5",
              boxShadow: "0 18px 40px rgba(15,23,42,0.08)",
            }}
            formatter={(value: number) => [integerFormatter.format(value), "Redemptions"]}
          />
          <Bar dataKey="redemptions" fill="#0f766e" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}

function PointsSummaryTile(props: {
  icon: LucideIcon;
  label: string;
  value: string;
  monthDelta: number;
  quarterDelta: number;
  compareMode: CompareMode;
}) {
  const { icon: Icon, label, value, monthDelta, quarterDelta, compareMode } = props;
  return (
    <div className="min-h-[132px] border-l border-[#edf2f7] px-4 py-3 first:border-l-0">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e7fbfb] text-[#0b7f88]">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[12px] font-bold text-[#24364f]">{label}</p>
          <p className="mt-1 text-[23px] font-extrabold leading-none tracking-normal text-[#15243a]">{value}</p>
        </div>
      </div>
      <div className="mt-3 space-y-1">
        <ComparisonLine value={monthDelta} label="vs last month" kind="percent" compareMode={compareMode} modeKey="last_month" />
        <ComparisonLine value={quarterDelta} label="vs last quarter" kind="percent" compareMode={compareMode} modeKey="last_quarter" />
      </div>
    </div>
  );
}

function PerformanceTable<T>(props: {
  title: string;
  subtitle: string;
  rows: T[];
  emptyState: string;
  columns: Array<{
    key: string;
    label: string;
    align?: "left" | "right";
    render: (row: T) => React.ReactNode;
  }>;
  footerHref: string;
  footerLabel: string;
}) {
  const { title, subtitle, rows, emptyState, columns, footerHref, footerLabel } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-bold text-[#18263b]">{title}</h3>
          <p className="mt-0.5 text-[11px] text-[#64748b]">{subtitle}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[#d6e0f2] bg-[#fbfdff] px-4 py-8 text-center text-sm text-[#6b7c92]">
          {emptyState}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[#eef2f7] bg-white">
          <div className="grid grid-cols-[1.45fr_0.65fr_0.75fr_0.75fr] gap-2 border-b border-[#edf2f7] px-3 py-2 text-[10px] font-semibold text-[#617087]">
            {columns.map((column) => (
              <div key={column.key} className={column.align === "right" ? "text-right" : ""}>
                {column.label}
              </div>
            ))}
          </div>
          <div className="flex-1 divide-y divide-[#edf2f7]">
            {rows.map((row, index) => (
              <div key={index} className="grid grid-cols-[1.45fr_0.65fr_0.75fr_0.75fr] gap-2 px-3 py-2.5 text-[12px] leading-4 text-[#18263b]">
                {columns.map((column) => (
                  <div key={column.key} className={column.align === "right" ? "text-right" : ""}>
                    {column.render(row)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      <Link to={footerHref} className="mt-3 text-center text-[12px] font-semibold text-[#0b7f88] transition hover:text-[#096d75]">
        {footerLabel}
      </Link>
    </div>
  );
}

function actionCenterIcon(label: string): LucideIcon {
  if (label.includes("Feedback")) return MessageSquareText;
  if (label.includes("Referral")) return Users;
  if (label.includes("Survey")) return ClipboardList;
  if (label.includes("Challenge")) return Trophy;
  if (label.includes("Push")) return Send;
  if (label.includes("Share")) return Share2;
  if (label.includes("Pending")) return ClipboardCheck;
  if (label.includes("Failed")) return RefreshCcw;
  if (label.includes("Expiring")) return CalendarDays;
  if (label.includes("Rewards")) return Gift;
  if (label.includes("Inactive")) return Users;
  return TriangleAlert;
}

function ActionCenterCard({ item }: { item: ActionCenterItem }) {
  const Icon = actionCenterIcon(item.label);
  const content = (
    <div className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg border border-[#e3eaf4] bg-[#fbfdff] p-2.5 transition hover:border-[#cbd9eb] hover:bg-white sm:grid-cols-[36px_minmax(0,1fr)_48px_82px]">
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]", actionToneClass(item.tone))}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-extrabold leading-5 text-[#071936]">{item.label}</p>
        <p className="truncate text-[11px] font-semibold leading-4 text-[#64748b]">{item.description}</p>
      </div>
      <span className={cn("inline-flex h-7 min-w-10 shrink-0 items-center justify-center rounded-[9px] px-2 text-[13px] font-black", actionToneClass(item.tone))}>
        {integerFormatter.format(item.count)}
      </span>
      <span
        className={cn(
          "col-span-3 inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border border-[#c7d9ee] bg-white px-2.5 text-[11px] font-black text-[#071936] sm:col-span-1",
          actionButtonToneClass(item.tone),
        )}
      >
        {item.actionLabel}
        <ChevronRight className="h-3 w-3" />
      </span>
    </div>
  );

  if (!item.actionHref) return content;

  return (
    <Link to={item.actionHref} className="block min-w-0">
      {content}
    </Link>
  );
}

function InsightCard({ item }: { item: InsightItem }) {
  const { icon: Icon, title, value, supporting, caption, href, ctaLabel, tone } = item;
  const content = (
    <div className="flex h-full min-h-[104px] flex-col rounded-lg border border-[#e3eaf4] bg-white p-4 shadow-[0_8px_20px_rgba(17,38,60,0.04)] transition hover:border-[#cdd9eb]">
      <div className="mb-2 flex items-start gap-3">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", insightToneClass(tone))}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold text-[#24364f]">{title}</p>
          <p className="mt-1 line-clamp-2 text-[15px] font-extrabold leading-tight text-[#15243a]">{value}</p>
        </div>
      </div>
      <p className="text-[12px] font-semibold leading-4 text-[#233b5d]">{supporting}</p>
      <div className="mt-auto flex items-end justify-between gap-3 pt-2">
        <p className="line-clamp-2 text-[11px] leading-4 text-[#64748b]">{caption}</p>
        {ctaLabel ? <ChevronRight className="h-4 w-4 shrink-0 text-[#52627a]" /> : null}
      </div>
    </div>
  );

  if (!href) return content;

  return (
    <Link to={href} className="block h-full">
      {content}
    </Link>
  );
}

function SystemSignalCard({ item }: { item: SystemSignalItem }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      className="flex min-h-[104px] min-w-0 flex-col rounded-lg border border-[#e3eaf4] bg-white p-4 shadow-[0_8px_20px_rgba(17,38,60,0.04)] transition hover:border-[#cdd9eb]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border", systemSignalToneClass(item.tone))}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[#7a8aa0]" />
      </div>
      <p className="mt-3 text-[12px] font-bold text-[#52627a]">{item.label}</p>
      <p className="mt-1 text-2xl font-extrabold leading-none text-[#071936]">{typeof item.value === "number" ? integerFormatter.format(item.value) : item.value}</p>
      <p className="mt-2 line-clamp-2 text-[11px] font-semibold leading-4 text-[#64748b]">{item.supporting}</p>
    </Link>
  );
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

  const invalid = !draftStart || !draftEnd || parseDateInput(draftStart) > parseDateInput(draftEnd, true);

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
            <DialogTitle>Choose dashboard date range</DialogTitle>
            <DialogDescription>Select the reporting window used across KPIs, charts, tables, and insights.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-[#233b5d]">Start date</span>
              <input type="date" value={draftStart} onChange={(event) => setDraftStart(event.target.value)} className={cn(adminInputClass, "rounded-md")} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-[#233b5d]">End date</span>
              <input type="date" value={draftEnd} onChange={(event) => setDraftEnd(event.target.value)} className={cn(adminInputClass, "rounded-md")} />
            </label>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setOpen(false)} className={adminOutlineButtonClass}>
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
              className={cn(adminPrimaryButtonClass, invalid && "cursor-not-allowed opacity-60")}
            >
              Apply range
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ComparisonSelector(props: {
  value: CompareMode;
  onChange: (value: CompareMode) => void;
}) {
  const { value, onChange } = props;
  return (
    <div className="relative">
      <select
        aria-label="Comparison mode"
        value={value}
        onChange={(event) => onChange(event.target.value as CompareMode)}
        className={cn(
          adminInputClass,
          "h-10 min-w-[210px] appearance-none rounded-md border-[#dfe7f1] bg-white pr-10 text-[12px] font-bold text-[#24364f] shadow-[0_4px_12px_rgba(17,38,60,0.04)]",
        )}
      >
        <option value="both">vs last month / vs last quarter</option>
        <option value="last_month">vs last month</option>
        <option value="last_quarter">vs last quarter</option>
      </select>
      <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-[#5f728d]" />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className={cn(adminPageShellClass, "max-w-none space-y-5")}>
      <div className="animate-pulse rounded-[20px] border border-[#dde6f2] bg-white p-6">
        <div className="h-5 w-32 rounded bg-[#eaf0f7]" />
        <div className="mt-3 h-10 w-72 rounded bg-[#eaf0f7]" />
        <div className="mt-3 h-4 w-[28rem] rounded bg-[#eef3f9]" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="animate-pulse rounded-[18px] border border-[#dde6f2] bg-white p-4">
            <div className="h-11 w-11 rounded-full bg-[#eef3f9]" />
            <div className="mt-4 h-4 w-28 rounded bg-[#eef3f9]" />
            <div className="mt-3 h-10 w-24 rounded bg-[#eaf0f7]" />
            <div className="mt-4 space-y-2">
              <div className="h-3 w-36 rounded bg-[#eef3f9]" />
              <div className="h-3 w-40 rounded bg-[#eef3f9]" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.65fr_0.95fr]">
        <div className="h-[390px] animate-pulse rounded-[20px] border border-[#dde6f2] bg-white" />
        <div className="h-[390px] animate-pulse rounded-[20px] border border-[#dde6f2] bg-white" />
      </div>
      <div className="h-[360px] animate-pulse rounded-[20px] border border-[#dde6f2] bg-white" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.45fr_0.9fr]">
        <div className="h-[360px] animate-pulse rounded-[20px] border border-[#dde6f2] bg-white" />
        <div className="h-[360px] animate-pulse rounded-[20px] border border-[#dde6f2] bg-white" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-[210px] animate-pulse rounded-[18px] border border-[#dde6f2] bg-white" />
        ))}
      </div>
    </div>
  );
}

function DashboardErrorBanner(props: { message: string; onRetry: () => void }) {
  const { message, onRetry } = props;
  return (
    <div className="rounded-[18px] border border-[#f2d1d6] bg-[#fff6f7] p-3 text-[#7c2534]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Dashboard data could not be loaded. Please check gateway and service health.</p>
            <p className="mt-1 text-sm text-[#965165]">{message}</p>
          </div>
        </div>
        <button type="button" onClick={onRetry} className={cn(adminOutlineButtonClass, "h-10 rounded-full border-[#f0c6cf] bg-white px-4 text-[#7c2534] hover:bg-[#fff1f3]")}>
          Retry
        </button>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { notificationCount = 0, openNotifications } = useOutletContext<AdminDashboardOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultStart = toInputDate(startOfCurrentMonth());
  const defaultEnd = toInputDate(new Date());
  const startDate = normalizeDateParam(searchParams.get("startDate"), defaultStart);
  const endDate = normalizeDateParam(searchParams.get("endDate"), defaultEnd);
  const compareMode = normalizeCompareParam(searchParams.get("compare"));

  const {
    members,
    transactions,
    pointsLots,
    rewardsCatalog,
    loginActivity,
    reengagementActions,
    loading,
    error,
    refetch,
  } = useAdminData();

  const [campaigns, setCampaigns] = useState<PromotionCampaign[]>([]);
  const [campaignPerformance, setCampaignPerformance] = useState<CampaignPerformance[]>([]);
  const [vouchers, setVouchers] = useState<RedemptionVoucher[]>([]);
  const [partnerDashboard, setPartnerDashboard] = useState<PartnerDashboardRow[]>([]);
  const [notificationCampaigns, setNotificationCampaigns] = useState<NotificationCampaign[]>([]);
  const [surveys, setSurveys] = useState<SurveyDefinition[]>([]);
  const [challenges, setChallenges] = useState<ChallengeDefinition[]>([]);
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRecord[]>([]);
  const [shareEvents, setShareEvents] = useState<ShareEvent[]>([]);
  const [auxLoading, setAuxLoading] = useState(true);
  const [auxError, setAuxError] = useState<string | null>(null);
  // Compact layout is enabled by default to fit more panels without scrolling.
  const compactMode = true;

  const refreshAuxiliaryData = useCallback(async () => {
    setAuxLoading(true);
    setAuxError(null);

    const results = await Promise.allSettled([
      loadPromotionCampaigns(),
      loadCampaignPerformance(),
      loadVouchersViaApi({}),
      loadPartnerDashboardViaApi(),
      loadNotificationCampaigns(),
      loadSurveyDefinitions(),
      loadChallengeDefinitions(),
      loadAllReferrals(),
      loadFeedback(),
      loadSocialShareEvents(),
    ]);

    const [
      campaignsResult,
      performanceResult,
      vouchersResult,
      partnerResult,
      notificationCampaignsResult,
      surveysResult,
      challengesResult,
      referralsResult,
      feedbackResult,
      shareEventsResult,
    ] = results;
    const failedEndpoints: string[] = [];

    if (campaignsResult.status === "fulfilled") {
      setCampaigns(campaignsResult.value);
    } else {
      console.error("[dashboard] GET /api/campaigns failed", campaignsResult.reason);
      setCampaigns([]);
      failedEndpoints.push("/api/campaigns");
    }

    if (performanceResult.status === "fulfilled") {
      setCampaignPerformance(performanceResult.value);
    } else {
      console.error("[dashboard] GET /api/campaigns/performance failed", performanceResult.reason);
      setCampaignPerformance([]);
      failedEndpoints.push("/api/campaigns/performance");
    }

    if (vouchersResult.status === "fulfilled") {
      setVouchers(vouchersResult.value.vouchers || []);
    } else {
      console.error("[dashboard] GET /api/vouchers failed", vouchersResult.reason);
      setVouchers([]);
      failedEndpoints.push("/api/vouchers");
    }

    if (partnerResult.status === "fulfilled") {
      setPartnerDashboard(partnerResult.value.partners || []);
    } else {
      console.error("[dashboard] GET /api/partners/dashboard failed", partnerResult.reason);
      setPartnerDashboard([]);
      failedEndpoints.push("/api/partners/dashboard");
    }

    if (notificationCampaignsResult.status === "fulfilled") {
      setNotificationCampaigns(notificationCampaignsResult.value || []);
    } else {
      console.error("[dashboard] GET /api/notification-campaigns failed", notificationCampaignsResult.reason);
      setNotificationCampaigns([]);
      failedEndpoints.push("/api/notification-campaigns");
    }

    if (surveysResult.status === "fulfilled") {
      setSurveys(surveysResult.value || []);
    } else {
      console.error("[dashboard] GET /api/engagement/surveys failed", surveysResult.reason);
      setSurveys([]);
      failedEndpoints.push("/api/engagement/surveys");
    }

    if (challengesResult.status === "fulfilled") {
      setChallenges(challengesResult.value || []);
    } else {
      console.error("[dashboard] GET /api/engagement/challenges failed", challengesResult.reason);
      setChallenges([]);
      failedEndpoints.push("/api/engagement/challenges");
    }

    if (referralsResult.status === "fulfilled") {
      setReferrals(referralsResult.value || []);
    } else {
      console.error("[dashboard] GET /api/members/referrals failed", referralsResult.reason);
      setReferrals([]);
      failedEndpoints.push("/api/members/referrals");
    }

    if (feedbackResult.status === "fulfilled") {
      setFeedback(feedbackResult.value || []);
    } else {
      console.error("[dashboard] GET /api/members/feedback failed", feedbackResult.reason);
      setFeedback([]);
      failedEndpoints.push("/api/members/feedback");
    }

    if (shareEventsResult.status === "fulfilled") {
      setShareEvents(shareEventsResult.value || []);
    } else {
      console.error("[dashboard] GET /api/social-share-events failed", shareEventsResult.reason);
      setShareEvents([]);
      failedEndpoints.push("/api/social-share-events");
    }

    if (failedEndpoints.length > 0) {
      setAuxError(`Some dashboard panels are partially unavailable: ${failedEndpoints.join(", ")}`);
    }

    setAuxLoading(false);
  }, []);

  useEffect(() => {
    void refreshAuxiliaryData();
  }, [refreshAuxiliaryData]);

  useEffect(() => {
    const refreshEverything = () => {
      void refetch();
      void refreshAuxiliaryData();
    };
    const interval = window.setInterval(refreshEverything, 30_000);
    window.addEventListener("focus", refreshEverything);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshEverything);
    };
  }, [refetch, refreshAuxiliaryData]);

  // no-op: compact mode fixed to true for this build

  const setQueryParams = useCallback(
    (patch: Partial<{ startDate: string; endDate: string; compare: CompareMode }>) => {
      const next = new URLSearchParams(searchParams);
      if (patch.startDate) next.set("startDate", patch.startDate);
      if (patch.endDate) next.set("endDate", patch.endDate);
      if (patch.compare) next.set("compare", patch.compare);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const memberRecords = useMemo<MemberRecord[]>(
    () =>
      members
        .map((member) => {
          const key = String(member.id ?? member.member_id ?? "");
          const fullName = `${member.first_name || ""} ${member.last_name || ""}`.trim() || member.member_number || "Member";
          const enrollmentMs = parseTimestamp(member.enrollment_date) ?? Number.POSITIVE_INFINITY;
          return {
            ...member,
            key,
            fullName,
            enrollmentMs,
            pointsBalance: Number(member.points_balance || 0),
          };
        })
        .filter((member) => Boolean(member.key)),
    [members],
  );

  const memberById = useMemo(() => new Map(memberRecords.map((member) => [member.key, member])), [memberRecords]);

  const activityDateMap = useMemo(() => {
    const map = new Map<string, number[]>();
    const pushDate = (memberKey: string, value: number | null) => {
      if (!memberKey || value === null) return;
      if (!map.has(memberKey)) map.set(memberKey, []);
      map.get(memberKey)!.push(value);
    };

    for (const member of memberRecords) {
      pushDate(member.key, parseTimestamp(member.last_activity_at));
    }

    for (const transaction of transactions) {
      pushDate(String(transaction.member_id), parseTimestamp(transaction.transaction_date));
    }

    for (const login of loginActivity) {
      pushDate(String(login.member_id), parseTimestamp(login.login_at));
    }

    for (const [, values] of map) {
      values.sort((left, right) => left - right);
    }

    return map;
  }, [loginActivity, memberRecords, transactions]);

  const dashboardData = useMemo(() => {
    const currentRange: PeriodRange = {
      startMs: parseDateInput(startDate),
      endMs: parseDateInput(endDate, true),
    };
    const previousMonthRange = shiftRangeByMonths(currentRange, -1);
    const previousQuarterRange = shiftRangeByMonths(currentRange, -3);

    const rewardCatalogById = new Map<string, RewardCatalogRow>();
    const rewardCatalogByName = new Map<string, RewardCatalogRow>();
    for (const reward of rewardsCatalog) {
      const key = String(reward.id ?? reward.reward_id ?? "");
      if (key) rewardCatalogById.set(key, reward);
      rewardCatalogByName.set(String(reward.name || "").trim().toLowerCase(), reward);
    }

    const sortedTransactionRows = transactions
      .map((transaction) => ({
        transaction,
        transactionMs: parseTimestamp(transaction.transaction_date),
      }))
      .filter((row): row is { transaction: LoyaltyTransaction; transactionMs: number } => row.transactionMs !== null)
      .sort((left, right) => left.transactionMs - right.transactionMs);

    const sumLiabilityAsOf = (endMs: number) => {
      if (pointsLots.length > 0) {
        return pointsLots.reduce((sum, lot) => {
          const earnedAt = parseTimestamp(lot.earned_at);
          const expiryAt = parseTimestamp(lot.expiry_date);
          if (earnedAt === null || expiryAt === null) return sum;
          if (earnedAt > endMs || expiryAt < endMs) return sum;
          return sum + Math.max(0, Number(lot.remaining_points || 0));
        }, 0);
      }

      return memberRecords
        .filter((member) => member.enrollmentMs <= endMs)
        .reduce((sum, member) => sum + member.pointsBalance, 0);
    };

    const latestActivityBefore = (memberKey: string, endMs: number) => {
      const dates = activityDateMap.get(memberKey) || [];
      for (let index = dates.length - 1; index >= 0; index -= 1) {
        if (dates[index] <= endMs) return dates[index];
      }
      return null;
    };

    const isActiveWithin = (memberKey: string, startMs: number, endMs: number) => {
      const dates = activityDateMap.get(memberKey) || [];
      for (let index = dates.length - 1; index >= 0; index -= 1) {
        if (dates[index] > endMs) continue;
        return dates[index] >= startMs;
      }
      return false;
    };

    const summarizeRange = (range: PeriodRange): PeriodSummary => {
      const membersInScope = memberRecords.filter((member) => member.enrollmentMs <= range.endMs);
      const rangeTransactions = sortedTransactionRows.filter((row) => row.transactionMs >= range.startMs && row.transactionMs <= range.endMs);
      const activeWindowStart = range.endMs - 29 * DAY_MS;

      const activeMembers30d = membersInScope.filter((member) => isActiveWithin(member.key, activeWindowStart, range.endMs)).length;
      const atRiskMembers = membersInScope.filter((member) => {
        const lastActivity = latestActivityBefore(member.key, range.endMs) ?? member.enrollmentMs;
        const inactiveDays = Math.floor((range.endMs - lastActivity) / DAY_MS);
        return inactiveDays >= 30 && inactiveDays < 60;
      }).length;

      const pointsIssued = rangeTransactions.reduce((sum, row) => {
        return classifyTransaction(row.transaction) === "issued" ? sum + Math.max(0, Number(row.transaction.points || 0)) : sum;
      }, 0);

      const pointsRedeemed = rangeTransactions.reduce((sum, row) => {
        return classifyTransaction(row.transaction) === "redeemed" ? sum + Math.abs(Number(row.transaction.points || 0)) : sum;
      }, 0);

      const totalMembers = membersInScope.length;
      const activeRate30d = safeRate(activeMembers30d, totalMembers);

      return {
        totalMembers,
        activeMembers30d,
        pointsLiability: sumLiabilityAsOf(range.endMs),
        pointsIssued,
        pointsRedeemed,
        redemptionRate: safeRate(pointsRedeemed, pointsIssued),
        newMembers: memberRecords.filter((member) => member.enrollmentMs >= range.startMs && member.enrollmentMs <= range.endMs).length,
        atRiskMembers,
        activeRate30d,
      };
    };

    const currentSummary = summarizeRange(currentRange);
    const previousMonthSummary = summarizeRange(previousMonthRange);
    const previousQuarterSummary = summarizeRange(previousQuarterRange);
    const buckets = buildDisplayBuckets(currentRange.startMs, currentRange.endMs);

    // Debug: emit the computed summaries so operators can inspect sparse/zero previous data.
    console.debug("[dashboard-debug]", { current: currentSummary, prevMonth: previousMonthSummary, prevQuarter: previousQuarterSummary });

    const programHealthTrend: TrendPoint[] = buckets.map((bucket) => ({
      label: bucket.label,
      totalMembers: memberRecords.filter((member) => member.enrollmentMs <= bucket.endMs).length,
      activeMembers30d: memberRecords.filter((member) => isActiveWithin(member.key, bucket.endMs - 29 * DAY_MS, bucket.endMs)).length,
    }));

    const pointsEconomyTrend: EconomyPoint[] = buckets.map((bucket) => {
      let pointsIssued = 0;
      let pointsRedeemed = 0;
      for (const row of sortedTransactionRows) {
        if (row.transactionMs < bucket.startMs || row.transactionMs > bucket.endMs) continue;
        const type = classifyTransaction(row.transaction);
        if (type === "issued") pointsIssued += Math.max(0, Number(row.transaction.points || 0));
        if (type === "redeemed") pointsRedeemed += Math.abs(Number(row.transaction.points || 0));
      }
      return {
        label: bucket.label,
        pointsIssued,
        pointsRedeemed,
      };
    });

    const rewardStats = new Map<
      string,
      {
        reward: RewardCatalogRow;
        redemptions: number;
        redeemers: Set<string>;
      }
    >();

    for (const reward of rewardsCatalog) {
      const key = String(reward.id ?? reward.reward_id ?? "");
      if (!key) continue;
      rewardStats.set(key, { reward, redemptions: 0, redeemers: new Set<string>() });
    }

    const rewardCountsCurrent = new Map<string, number>();
    const rewardCountsPrevious = new Map<string, number>();
    const transactionRowsForInsight: Array<{ transaction: LoyaltyTransaction; transactionMs: number }> = [];
    const previousMonthStart = previousMonthRange.startMs;
    const previousMonthEnd = previousMonthRange.endMs;

    for (const row of sortedTransactionRows) {
      const type = classifyTransaction(row.transaction);
      if (type !== "redeemed") continue;

      const rewardKeyFromCatalog = row.transaction.reward_catalog_id ? String(row.transaction.reward_catalog_id) : "";
      const fallbackName = String(row.transaction.reason || row.transaction.description || "Reward").trim().toLowerCase();
      const reward = rewardStats.get(rewardKeyFromCatalog)?.reward || rewardCatalogByName.get(fallbackName);
      const rewardKey = reward ? String(reward.id ?? reward.reward_id ?? "") : rewardKeyFromCatalog;

      if (row.transactionMs >= currentRange.startMs && row.transactionMs <= currentRange.endMs) {
        transactionRowsForInsight.push(row);
        if (rewardKey && rewardStats.has(rewardKey)) {
          rewardStats.get(rewardKey)!.redemptions += 1;
          rewardStats.get(rewardKey)!.redeemers.add(String(row.transaction.member_id));
        }
        if (rewardKey) {
          rewardCountsCurrent.set(rewardKey, (rewardCountsCurrent.get(rewardKey) || 0) + 1);
        }
      }

      if (row.transactionMs >= previousMonthStart && row.transactionMs <= previousMonthEnd && rewardKey) {
        rewardCountsPrevious.set(rewardKey, (rewardCountsPrevious.get(rewardKey) || 0) + 1);
      }
    }

    const rewardPerformanceRows: PerformanceRow[] = Array.from(rewardStats.values())
      .map(({ reward, redemptions, redeemers }) => ({
        id: String(reward.id ?? reward.reward_id ?? reward.name),
        name: String(reward.name || "Reward"),
        status: rewardStatusLabel(reward),
        redemptions,
        rate: safeRate(redeemers.size, Math.max(currentSummary.totalMembers, 1)),
      }))
      .filter((row) => row.redemptions > 0 || row.status === "Active")
      .sort((left, right) => right.redemptions - left.redemptions || right.rate - left.rate);

    const memberPointsIssued = new Map<string, number>();
    for (const row of sortedTransactionRows) {
      if (row.transactionMs < currentRange.startMs || row.transactionMs > currentRange.endMs) continue;
      if (classifyTransaction(row.transaction) !== "issued") continue;
      const memberKey = String(row.transaction.member_id);
      memberPointsIssued.set(memberKey, (memberPointsIssued.get(memberKey) || 0) + Math.max(0, Number(row.transaction.points || 0)));
    }

    let topMember: { memberKey: string; points: number } | null = null;
    for (const [memberKey, points] of memberPointsIssued) {
      if (!topMember || points > topMember.points) topMember = { memberKey, points };
    }

    let unusualRewardAlert: { key: string; change: number } | null = null;
    for (const row of rewardPerformanceRows) {
      const current = rewardCountsCurrent.get(row.id) || 0;
      const previous = rewardCountsPrevious.get(row.id) || 0;
      const change = differencePercent(current, previous);
      if (current <= 0 || change <= 0) continue;
      if (!unusualRewardAlert || change > unusualRewardAlert.change) {
        unusualRewardAlert = { key: row.id, change };
      }
    }

    return {
      currentRange,
      previousMonthRange,
      previousQuarterRange,
      currentSummary,
      previousMonthSummary,
      previousQuarterSummary,
      programHealthTrend,
      pointsEconomyTrend,
      rewardPerformanceRows,
      topMember,
      unusualRewardAlert,
      rewardCountsCurrent,
      rewardCountsPrevious,
      currentRangeTransactions: transactionRowsForInsight,
    };
  }, [activityDateMap, endDate, loginActivity, memberRecords, pointsLots, rewardsCatalog, startDate, transactions]);

  const performanceByCampaignId = useMemo(
    () => new Map(campaignPerformance.map((row) => [row.campaignId, row])),
    [campaignPerformance],
  );

  const topCampaignRows = useMemo<PerformanceRow[]>(() => {
    return campaigns
      .map((campaign) => {
        const performance = performanceByCampaignId.get(campaign.id);
        const startsAt = parseTimestamp(campaign.startsAt) ?? 0;
        const endsAt = parseTimestamp(campaign.endsAt) ?? Number.MAX_SAFE_INTEGER;
        const overlapsRange =
          startsAt <= dashboardData.currentRange.endMs && endsAt >= dashboardData.currentRange.startMs;
        const redemptions = performance?.redemptionCount ?? 0;
        const engagementRate =
          performance?.notificationsSent && performance.notificationsSent > 0
            ? safeRate(performance.trackedTransactions, performance.notificationsSent)
            : safeRate(performance?.redemptionCount ?? 0, Math.max(performance?.trackedTransactions ?? 0, 1));

        return {
          id: campaign.id,
          name: campaign.campaignName,
          status: campaignStatusLabel(campaign.status),
          redemptions,
          rate: engagementRate,
          overlapsRange,
        };
      })
      .filter((row) => row.overlapsRange || row.redemptions > 0)
      .sort((left, right) => right.rate - left.rate || right.redemptions - left.redemptions)
      .slice(0, 5)
      .map(({ overlapsRange: _overlapsRange, ...row }) => row);
  }, [campaigns, dashboardData.currentRange.endMs, dashboardData.currentRange.startMs, performanceByCampaignId]);

  const inactiveMembers = useMemo(
    () => buildInactiveMemberInsights(members, transactions, loginActivity),
    [loginActivity, members, transactions],
  );

  const currentSummary = dashboardData.currentSummary;
  const previousMonthSummary = dashboardData.previousMonthSummary;
  const previousQuarterSummary = dashboardData.previousQuarterSummary;

  const statusRows = useMemo<StatusRow[]>(() => {
    const newMembersTarget = Math.max(previousMonthSummary.newMembers, previousQuarterSummary.newMembers, 1);
    const atRiskTarget = Math.max(1, Math.min(previousMonthSummary.atRiskMembers || currentSummary.atRiskMembers || 1, previousQuarterSummary.atRiskMembers || currentSummary.atRiskMembers || 1));
    const activeRateTarget = Math.max(previousMonthSummary.activeRate30d, previousQuarterSummary.activeRate30d, 1);

    const newMembersStatus = buildTargetStatus(currentSummary.newMembers, newMembersTarget, false);
    const atRiskStatus = buildTargetStatus(currentSummary.atRiskMembers, atRiskTarget, true);
    const activeRateStatus = buildTargetStatus(currentSummary.activeRate30d, activeRateTarget, false);

    return [
      {
        icon: UserPlus,
        label: "New Members",
        value: integerFormatter.format(currentSummary.newMembers),
        targetLabel: `Target: ${integerFormatter.format(newMembersTarget)}+`,
        monthDelta: differencePercent(currentSummary.newMembers, previousMonthSummary.newMembers),
        quarterDelta: differencePercent(currentSummary.newMembers, previousQuarterSummary.newMembers),
        deltaKind: "percent",
        badgeLabel: newMembersStatus.label,
        badgeTone: newMembersStatus.tone,
      },
      {
        icon: TriangleAlert,
        label: "At-Risk Members",
        value: integerFormatter.format(currentSummary.atRiskMembers),
        targetLabel: `Target: < ${integerFormatter.format(atRiskTarget)}`,
        monthDelta: differencePercent(currentSummary.atRiskMembers, previousMonthSummary.atRiskMembers),
        quarterDelta: differencePercent(currentSummary.atRiskMembers, previousQuarterSummary.atRiskMembers),
        deltaKind: "percent",
        invertComparison: true,
        badgeLabel: atRiskStatus.label,
        badgeTone: atRiskStatus.tone,
      },
      {
        icon: Activity,
        label: "Active Rate (30d)",
        value: `${singleDecimalFormatter.format(currentSummary.activeRate30d)}%`,
        targetLabel: `Target: ${singleDecimalFormatter.format(activeRateTarget)}%+`,
        monthDelta: differencePoints(currentSummary.activeRate30d, previousMonthSummary.activeRate30d),
        quarterDelta: differencePoints(currentSummary.activeRate30d, previousQuarterSummary.activeRate30d),
        deltaKind: "pp",
        badgeLabel: activeRateStatus.label,
        badgeTone: activeRateStatus.tone,
      },
    ];
  }, [currentSummary, previousMonthSummary, previousQuarterSummary]);

  const partnerWarnings = useMemo(
    () =>
      partnerDashboard
        .filter((row) => row.totals.pendingTransactions > 0)
        .map((row) => ({
          primary: row.partner.partnerName,
          secondary: `${integerFormatter.format(row.totals.pendingTransactions)} pending partner settlements need review.`,
          badge: `${integerFormatter.format(row.totals.pendingTransactions)} pending`,
        })),
    [partnerDashboard],
  );

  const liveSurveys = useMemo(() => surveys.filter((survey) => survey.status === "live"), [surveys]);
  const activeChallenges = useMemo(
    () => challenges.filter((challenge) => (parseTimestamp(challenge.endAt) ?? 0) >= Date.now()),
    [challenges],
  );
  const scheduledPushCampaigns = useMemo(
    () => notificationCampaigns.filter((campaign) => campaign.status === "scheduled" || campaign.status === "live"),
    [notificationCampaigns],
  );
  const referralConversions = useMemo(() => referrals.filter((referral) => referral.status === "joined").length, [referrals]);
  const pendingReferralInvites = useMemo(() => referrals.filter((referral) => referral.status !== "joined"), [referrals]);
  const surveyResponseCount = useMemo(
    () => surveys.reduce((sum, survey) => sum + Math.max(0, survey.responses?.length || 0), 0),
    [surveys],
  );
  const shareConversionCount = useMemo(
    () => shareEvents.reduce((sum, event) => sum + Math.max(0, Number(event.conversions || 0)), 0),
    [shareEvents],
  );
  const averageFeedbackRating = useMemo(
    () => (feedback.length ? feedback.reduce((sum, item) => sum + Number(item.rating || 0), 0) / feedback.length : 0),
    [feedback],
  );
  const lowRatingFeedback = useMemo(() => feedback.filter((item) => Number(item.rating || 0) <= 3), [feedback]);

  const systemSignals = useMemo<SystemSignalItem[]>(
    () => [
      {
        label: "Push Campaigns",
        value: scheduledPushCampaigns.length,
        supporting: `${notificationCampaigns.length} total campaigns synced from notification service`,
        href: "/admin/engagement?tab=notifications&modal=push",
        icon: Send,
        tone: "blue",
      },
      {
        label: "Referral Pipeline",
        value: referrals.length,
        supporting: `${referralConversions} conversions / ${pendingReferralInvites.length} pending invites`,
        href: "/admin/engagement?modal=referrals",
        icon: Users,
        tone: "teal",
      },
      {
        label: "Member Feedback",
        value: feedback.length,
        supporting: `${averageFeedbackRating ? averageFeedbackRating.toFixed(1) : "0.0"} avg rating / ${lowRatingFeedback.length} need attention`,
        href: "/admin/engagement?modal=feedback",
        icon: MessageSquareText,
        tone: lowRatingFeedback.length > 0 ? "rose" : "violet",
      },
      {
        label: "Live Surveys",
        value: liveSurveys.length,
        supporting: `${surveyResponseCount} submitted responses across ${surveys.length} surveys`,
        href: "/admin/engagement?tab=surveys&modal=surveys",
        icon: ClipboardList,
        tone: "violet",
      },
      {
        label: "Active Challenges",
        value: activeChallenges.length,
        supporting: `${challenges.length} published challenges available to customers`,
        href: "/admin/engagement?tab=challenges&modal=challenges",
        icon: Trophy,
        tone: "green",
      },
      {
        label: "Social Shares",
        value: shareEvents.length,
        supporting: `${shareConversionCount} referral conversions attributed to share events`,
        href: "/admin/engagement?tab=sharing",
        icon: Share2,
        tone: "amber",
      },
    ],
    [
      activeChallenges.length,
      averageFeedbackRating,
      challenges.length,
      feedback.length,
      liveSurveys.length,
      lowRatingFeedback.length,
      notificationCampaigns.length,
      pendingReferralInvites.length,
      referralConversions,
      referrals.length,
      scheduledPushCampaigns.length,
      shareConversionCount,
      shareEvents.length,
      surveyResponseCount,
      surveys.length,
    ],
  );

  const actionCenterItems = useMemo<ActionCenterItem[]>(() => {
    const now = Date.now();
    const pendingValidations = vouchers
      .filter((voucher) => voucher.status === "ready")
      .sort((left, right) => (parseTimestamp(right.createdAt) ?? 0) - (parseTimestamp(left.createdAt) ?? 0));
    const failedRedemptions = vouchers
      .filter((voucher) => {
        if (voucher.status !== "processing") return false;
        const createdAt = parseTimestamp(voucher.createdAt) ?? now;
        return now - createdAt > 3 * DAY_MS;
      })
      .sort((left, right) => (parseTimestamp(right.createdAt) ?? 0) - (parseTimestamp(left.createdAt) ?? 0));
    const expiringCampaigns = campaigns
      .filter((campaign) => {
        const endsAt = parseTimestamp(campaign.endsAt);
        if (endsAt === null) return false;
        return endsAt >= now && endsAt <= now + 14 * DAY_MS && (campaign.status === "active" || campaign.status === "scheduled");
      })
      .sort((left, right) => (parseTimestamp(left.endsAt) ?? 0) - (parseTimestamp(right.endsAt) ?? 0));
    const activeRewardRows = dashboardData.rewardPerformanceRows.filter((row) => row.status === "Active");
    const averageRewardRedemptions =
      activeRewardRows.length > 0
        ? activeRewardRows.reduce((sum, row) => sum + row.redemptions, 0) / activeRewardRows.length
        : 0;
    const lowPerformingRewards = activeRewardRows
      .filter((row) => row.redemptions <= Math.max(1, averageRewardRedemptions * 0.35))
      .slice(0, 10);
    const contactWarnings = memberRecords
      .filter((member) => !String(member.email || "").trim() && !String(member.phone || "").trim())
      .slice(0, 10)
      .map((member) => ({
        primary: member.fullName,
        secondary: `${member.member_number} is missing both email and phone contact fields.`,
        badge: "Profile gap",
      }));
    const missingPerformanceWarnings = campaigns
      .filter((campaign) => campaign.status === "active" && !performanceByCampaignId.has(campaign.id))
      .slice(0, 10)
      .map((campaign) => ({
        primary: campaign.campaignName,
        secondary: "Campaign is active but no performance summary is available yet.",
        badge: "Data gap",
      }));

    const systemWarnings = [...contactWarnings, ...partnerWarnings, ...missingPerformanceWarnings];
    const recentFeedbackRecords = feedback
      .slice(0, 6)
      .map((item) => ({
        primary: item.memberName || item.memberId || "Member feedback",
        secondary: `${item.rating}/5 ${item.category} / ${item.comment}`,
        badge: Number(item.rating) <= 3 ? "Needs review" : "Feedback",
      }));
    const pendingReferralRecords = pendingReferralInvites
      .slice(0, 6)
      .map((referral) => ({
        primary: referral.referrerCode || referral.referrerMemberId || "Referral invite",
        secondary: `${referral.refereeEmail} / created ${new Date(referral.createdAt).toLocaleDateString()}`,
        badge: "Pending",
      }));
    const surveyRecords = liveSurveys
      .slice(0, 6)
      .map((survey) => ({
        primary: survey.title,
        secondary: `${survey.responses?.length || 0} responses / ${survey.bonusPoints} bonus points / ${survey.segment}`,
        badge: "Live",
      }));
    const challengeRecords = activeChallenges
      .slice(0, 6)
      .map((challenge) => ({
        primary: challenge.title,
        secondary: `${challenge.rewardPoints} reward points / ends ${new Date(challenge.endAt).toLocaleDateString()}`,
        badge: "Active",
      }));
    const pushRecords = scheduledPushCampaigns
      .slice(0, 6)
      .map((campaign) => ({
        primary: campaign.name,
        secondary: `${campaign.segment} / ${campaign.status} / ${new Date(campaign.scheduledFor).toLocaleDateString()}`,
        badge: campaign.status,
      }));

    return [
      {
        label: "Customer Feedback",
        count: feedback.length,
        actionLabel: "Review",
        actionHref: "/admin/engagement?modal=feedback",
        tone: "violet",
        description: "Feedback submitted from the customer engagement page.",
        emptyText: "No member feedback has been submitted yet.",
        records: recentFeedbackRecords.length > 0 ? recentFeedbackRecords : emptyActionRecords("No member feedback has been submitted yet."),
      },
      {
        label: "Referral Pipeline",
        count: pendingReferralInvites.length,
        actionLabel: "Track",
        actionHref: "/admin/engagement?modal=referrals",
        tone: "teal",
        description: "Pending referral invites waiting for conversion.",
        emptyText: "No pending referral invites are waiting right now.",
        records: pendingReferralRecords.length > 0 ? pendingReferralRecords : emptyActionRecords("No pending referral invites are waiting right now."),
      },
      {
        label: "Live Surveys",
        count: liveSurveys.length,
        actionLabel: "Open",
        actionHref: "/admin/engagement?tab=surveys&modal=surveys",
        tone: "blue",
        description: "Published surveys visible to customer survey and earn-points flows.",
        emptyText: "No live surveys are currently published.",
        records: surveyRecords.length > 0 ? surveyRecords : emptyActionRecords("No live surveys are currently published."),
      },
      {
        label: "Active Challenges",
        count: activeChallenges.length,
        actionLabel: "Open",
        actionHref: "/admin/engagement?tab=challenges&modal=challenges",
        tone: "amber",
        description: "Published challenges visible to customers.",
        emptyText: "No active customer challenges are currently published.",
        records: challengeRecords.length > 0 ? challengeRecords : emptyActionRecords("No active customer challenges are currently published."),
      },
      {
        label: "Scheduled Push",
        count: scheduledPushCampaigns.length,
        actionLabel: "Manage",
        actionHref: "/admin/engagement?tab=notifications&modal=push",
        tone: "blue",
        description: "Notification campaigns scheduled or live in the notification service.",
        emptyText: "No push campaigns are scheduled or live.",
        records: pushRecords.length > 0 ? pushRecords : emptyActionRecords("No push campaigns are scheduled or live."),
      },
      {
        label: "Pending Validations",
        count: pendingValidations.length,
        actionLabel: "Review",
        actionHref: "/admin/activity?status=pending_validation",
        tone: "amber",
        description: "Reward vouchers waiting for manual or counter validation.",
        emptyText: "No vouchers are waiting for validation.",
        records:
          pendingValidations.length > 0 ? pendingValidations.slice(0, 6).map((voucher) => ({
            primary: voucher.rewardName,
            secondary: `${voucher.voucherCode} / ${voucher.method === "in-store" ? "In-store pickup" : "Delivery processing"} / ${new Date(voucher.createdAt).toLocaleDateString()}`,
            badge: "Ready",
          })) : emptyActionRecords("No vouchers are waiting for validation."),
      },
      {
        label: "Failed Redemptions",
        count: failedRedemptions.length,
        actionLabel: "Resolve",
        actionHref: "/admin/activity?status=processing",
        tone: "rose",
        description: "Processing vouchers that have remained unresolved for more than 3 days.",
        emptyText: "No overdue redemption issues were detected.",
        records:
          failedRedemptions.length > 0 ? failedRedemptions.slice(0, 6).map((voucher) => ({
            primary: voucher.rewardName,
            secondary: `${voucher.voucherCode} has been processing since ${new Date(voucher.createdAt).toLocaleDateString()}.`,
            badge: "Overdue",
          })) : emptyActionRecords("No overdue redemption issues were detected."),
      },
      {
        label: "Expiring Campaigns",
        count: expiringCampaigns.length,
        actionLabel: "View",
        actionHref: "/admin/rewards#rewards-campaigns",
        tone: "amber",
        description: "Campaigns that end within the next 14 days and may need extension or replacement.",
        emptyText: "No campaigns are expiring soon.",
        records:
          expiringCampaigns.length > 0 ? expiringCampaigns.slice(0, 6).map((campaign) => ({
            primary: campaign.campaignName,
            secondary: `${campaignStatusLabel(campaign.status)} / ends ${new Date(campaign.endsAt).toLocaleDateString()}`,
            badge: "Expiring",
          })) : emptyActionRecords("No campaigns are expiring soon."),
      },
      {
        label: "Low Performing Rewards",
        count: lowPerformingRewards.length,
        actionLabel: "Improve",
        actionHref: "/admin/rewards",
        tone: "violet",
        description: "Active rewards underperforming relative to the current period redemption baseline.",
        emptyText: "All visible rewards are performing within the current benchmark band.",
        records:
          lowPerformingRewards.length > 0 ? lowPerformingRewards.slice(0, 6).map((reward) => ({
            primary: reward.name,
            secondary: `${integerFormatter.format(reward.redemptions)} redemptions / ${singleDecimalFormatter.format(reward.rate)}% redemption rate`,
            badge: "Low traction",
          })) : emptyActionRecords("All visible rewards are performing within the current benchmark band."),
      },
      {
        label: "Inactive Members (60+ days)",
        count: inactiveMembers.length,
        actionLabel: "Engage",
        actionHref: "/admin/engagement?tab=winback&modal=inactive",
        tone: "blue",
        description: "Members who have been dormant long enough to qualify for a win-back action.",
        emptyText: "No inactive member backlog is currently above the 60-day threshold.",
        records:
          inactiveMembers.length > 0 ? inactiveMembers.slice(0, 6).map((member) => ({
            primary: member.memberName,
            secondary: `${member.memberNumber} / ${member.daysInactive} days inactive / ${member.suggestedOffer}`,
            badge: member.riskLevel,
          })) : emptyActionRecords("No inactive member backlog is currently above the 60-day threshold."),
      },
      {
        label: "System Warnings",
        count: systemWarnings.length,
        actionLabel: "View",
        actionHref: "/admin/settings",
        tone: "rose",
        description: "Data quality and partner workflow issues that may affect reporting or operations.",
        emptyText: "No active dashboard warnings were detected from the currently available records.",
        records: systemWarnings.length > 0 ? systemWarnings.slice(0, 6) : emptyActionRecords("No active dashboard warnings were detected from the currently available records."),
      },
    ];
  }, [
    activeChallenges,
    campaigns,
    dashboardData.rewardPerformanceRows,
    feedback,
    inactiveMembers,
    liveSurveys,
    memberRecords,
    partnerWarnings,
    pendingReferralInvites,
    performanceByCampaignId,
    scheduledPushCampaigns,
    vouchers,
  ]);

  const visibleActionCenterItems = useMemo(
    () => actionCenterItems.slice(0, 5),
    [actionCenterItems],
  );
  const monitoredActionCount = Math.max(0, actionCenterItems.length - visibleActionCenterItems.length);

  const insights = useMemo<InsightItem[]>(() => {
    const topMemberInsight: InsightItem = dashboardData.topMember
      ? {
          title: "Top Earning Member",
          value: memberById.get(dashboardData.topMember.memberKey)?.fullName || "Top member",
          supporting: `${integerFormatter.format(dashboardData.topMember.points)} pts earned this period`,
          caption: `${memberById.get(dashboardData.topMember.memberKey)?.member_number || "Member"} generated the highest points-earning volume in the selected range.`,
          href: "/admin/members",
          ctaLabel: "Open members",
          icon: Users,
          tone: "teal",
        }
      : {
          title: "Top Earning Member",
          value: "No earning activity",
          supporting: "No positive points activity in the selected range",
          caption: "Once points are issued again, the leading member will appear here automatically.",
          href: "/admin/members",
          ctaLabel: "Open members",
          icon: Users,
          tone: "teal",
        };

    const topReward = dashboardData.rewardPerformanceRows[0];
    const topRewardInsight: InsightItem = topReward
      ? {
          title: "Most Redeemed Reward",
          value: topReward.name,
          supporting: `${integerFormatter.format(topReward.redemptions)} redemptions`,
          caption: `Current redemption rate: ${singleDecimalFormatter.format(topReward.rate)}%.`,
          href: "/admin/rewards",
          ctaLabel: "Open rewards",
          icon: Gift,
          tone: "amber",
        }
      : {
          title: "Most Redeemed Reward",
          value: "No reward signal yet",
          supporting: "Redemption activity will surface here once members start claiming rewards",
          caption: "The dashboard stays clean instead of filling this with placeholder rankings.",
          href: "/admin/rewards",
          ctaLabel: "Open rewards",
          icon: Gift,
          tone: "amber",
        };

    const bestCampaign = topCampaignRows[0];
    const campaignInsight: InsightItem = bestCampaign
      ? {
          title: "Best Performing Campaign",
          value: bestCampaign.name,
          supporting: `${singleDecimalFormatter.format(bestCampaign.rate)}% engagement`,
          caption: `${integerFormatter.format(bestCampaign.redemptions)} redemptions attributed to the top campaign performance row.`,
          href: "/admin/rewards#rewards-campaigns",
          ctaLabel: "Open campaigns",
          icon: Megaphone,
          tone: "violet",
        }
      : {
          title: "Best Performing Campaign",
          value: "No active campaign signal",
          supporting: "Campaign performance data has not produced a ranked leader yet",
          caption: "Launch or publish a campaign to see the strongest performer here.",
          href: "/admin/rewards#rewards-campaigns",
          ctaLabel: "Open campaigns",
          icon: Megaphone,
          tone: "violet",
        };

    const unusualReward = dashboardData.unusualRewardAlert
      ? dashboardData.rewardPerformanceRows.find((row) => row.id === dashboardData.unusualRewardAlert?.key) || null
      : null;
    const unusualRedemptionInsight: InsightItem = unusualReward
      ? {
          title: "Unusual Redemption Alert",
          value: `Spike in ${unusualReward.name}`,
          supporting: `${formatSignedPercent(dashboardData.unusualRewardAlert?.change || 0)} vs last month`,
          caption: "Monitor this reward over the next 7 days to confirm whether the spike sustains.",
          href: "/admin/activity",
          ctaLabel: "Monitor",
          icon: ShieldAlert,
          tone: "rose",
        }
      : {
          title: "Unusual Redemption Alert",
          value: "No spike detected",
          supporting: "Reward redemptions are within the current month-over-month band",
          caption: "A material outlier will appear here once one reward materially departs from its recent baseline.",
          href: "/admin/activity",
          ctaLabel: "Monitor",
          icon: ShieldAlert,
          tone: "rose",
        };

    const latestAction = [...reengagementActions]
      .sort((left, right) => (parseTimestamp(right.completed_at || right.sent_at || right.created_at) ?? 0) - (parseTimestamp(left.completed_at || left.sent_at || left.created_at) ?? 0))[0];
    const latestActionDate = latestAction ? parseTimestamp(latestAction.completed_at || latestAction.sent_at || latestAction.created_at) : null;
    const latestCriticalInsight: InsightItem = latestAction
      ? {
          title: "Latest Critical Admin Action",
          value: latestAction.recommended_action || latestAction.action_type,
          supporting: latestActionDate ? new Date(latestActionDate).toLocaleDateString() : "Recent action",
          caption: `Recorded by ${latestAction.initiated_by || "Admin workflow"}.`,
          href: "/admin/settings",
          ctaLabel: "Audit",
          icon: Sparkles,
          tone: "blue",
        }
      : {
          title: "Latest Critical Admin Action",
          value: "No critical action recorded",
          supporting: "The dashboard has not found a recent admin workflow update in the available action stream",
          caption: "Once a critical admin action is logged, it will appear here with the owner and date.",
          href: "/admin/settings",
          ctaLabel: "Audit",
          icon: Sparkles,
          tone: "blue",
        };

    return [topMemberInsight, topRewardInsight, campaignInsight, unusualRedemptionInsight, latestCriticalInsight];
  }, [dashboardData.rewardPerformanceRows, dashboardData.topMember, dashboardData.unusualRewardAlert, memberById, reengagementActions, topCampaignRows]);

  const kpiCards = useMemo(
    () => [
      {
        icon: Users,
        title: "Total Members",
        value: integerFormatter.format(currentSummary.totalMembers),
        monthDelta: differencePercent(currentSummary.totalMembers, previousMonthSummary.totalMembers),
        quarterDelta: differencePercent(currentSummary.totalMembers, previousQuarterSummary.totalMembers),
      },
      {
        icon: Users,
        title: "Active Members (30d)",
        value: integerFormatter.format(currentSummary.activeMembers30d),
        monthDelta: differencePercent(currentSummary.activeMembers30d, previousMonthSummary.activeMembers30d),
        quarterDelta: differencePercent(currentSummary.activeMembers30d, previousQuarterSummary.activeMembers30d),
      },
      {
        icon: Coins,
        title: "Points Liability",
        value: formatCompactValue(currentSummary.pointsLiability),
        monthDelta: differencePercent(currentSummary.pointsLiability, previousMonthSummary.pointsLiability),
        quarterDelta: differencePercent(currentSummary.pointsLiability, previousQuarterSummary.pointsLiability),
      },
      {
        icon: RefreshCcw,
        title: "Points Redeemed",
        value: formatCompactValue(currentSummary.pointsRedeemed),
        monthDelta: differencePercent(currentSummary.pointsRedeemed, previousMonthSummary.pointsRedeemed),
        quarterDelta: differencePercent(currentSummary.pointsRedeemed, previousQuarterSummary.pointsRedeemed),
      },
      {
        icon: Percent,
        title: "Redemption Rate",
        value: `${singleDecimalFormatter.format(currentSummary.redemptionRate)}%`,
        monthDelta: differencePoints(currentSummary.redemptionRate, previousMonthSummary.redemptionRate),
        quarterDelta: differencePoints(currentSummary.redemptionRate, previousQuarterSummary.redemptionRate),
        deltaKind: "pp" as const,
      },
    ],
    [currentSummary, previousMonthSummary, previousQuarterSummary],
  );

  const topRewardRows = dashboardData.rewardPerformanceRows.slice(0, 5);

  const handleRetry = useCallback(() => {
    void refetch();
    void refreshAuxiliaryData();
  }, [refetch, refreshAuxiliaryData]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <>
      <div className={cn(adminPageShellClass, "mx-auto max-w-[1540px] space-y-3 px-3 py-2 pb-5")}>
        <header className="rounded-[16px] border border-[#d9e8f6] bg-[linear-gradient(135deg,#ffffff_0%,#f3fbff_48%,#eef8ff_100%)] px-5 py-5 shadow-[0_14px_32px_rgba(17,38,60,0.07)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="inline-flex items-center rounded-full border border-[#cbe4f6] bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#0b7f88]">
                Admin Command Center
              </div>
              <h1 className="mt-3 text-[28px] font-extrabold leading-none tracking-normal text-[#132036] sm:text-[30px]">Dashboard Overview</h1>
              <p className="mt-2 text-[13px] font-medium text-[#5f6f86]">Monitor loyalty health, rewards performance, and operational alerts.</p>
            </div>

            <div className="flex shrink-0 items-center gap-2.5 self-start">
              {auxLoading ? (
                <span className="inline-flex h-10 items-center rounded-full border border-[#dfe7f1] bg-white px-3 text-[12px] font-bold text-[#64748b] shadow-[0_8px_18px_rgba(17,38,60,0.05)]">
                  Refreshing data
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => openNotifications?.()}
                aria-label="Notifications"
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d4e5f4] bg-white/80 text-[#132036] shadow-[0_8px_18px_rgba(17,38,60,0.06)] transition hover:bg-white hover:shadow-sm"
              >
                <Bell className="h-5 w-5" />
                {notificationCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-white bg-[#0b8b95] px-1 text-[10px] font-bold text-white">
                    {notificationCount}
                  </span>
                ) : null}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="inline-flex w-fit items-center rounded-full border border-[#d7e7f4] bg-white/75 px-3 py-1.5 text-[12px] font-semibold text-[#52627a] shadow-[0_6px_16px_rgba(17,38,60,0.04)]">
              <CalendarDays className="mr-2 h-4 w-4 text-[#0b7f88]" />
              <span>{formatHeaderRange(startDate, endDate)}</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <DateRangeSelector
                startDate={startDate}
                endDate={endDate}
                onApply={(nextStart, nextEnd) => setQueryParams({ startDate: nextStart, endDate: nextEnd })}
              />
              <ComparisonSelector value={compareMode} onChange={(value) => setQueryParams({ compare: value })} />
              <Link to="/admin/rewards#rewards-campaigns" className={cn(adminPrimaryButtonClass, "h-10 rounded-md px-4 shadow-[0_8px_18px_rgba(11,127,136,0.18)]")}>
                <Megaphone className="h-4 w-4" />
                Create Campaign
              </Link>
            </div>
          </div>
        </header>

        {error ? <DashboardErrorBanner message={error} onRetry={handleRetry} /> : null}
        {auxError ? (
          <div className="rounded-lg border border-[#f6e0b8] bg-[#fffaf0] px-4 py-3 text-[12px] font-semibold text-[#9a6117]">
            {auxError}
          </div>
        ) : null}

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {kpiCards.map((card) => (
            <DashboardKpiCard key={card.title} {...card} compareMode={compareMode} />
          ))}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-extrabold text-[#18263b]">System Activity Sync</h2>
              <p className="text-[12px] font-semibold text-[#64748b]">Customer and admin workflow events reflected from live APIs.</p>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[#dfe7f1] bg-white px-3 text-[12px] font-bold text-[#24364f] transition hover:bg-[#f8fbff]"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {systemSignals.map((item) => (
              <SystemSignalCard key={item.label} item={item} />
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.85fr)]">
          <SectionCard title="Program Health Snapshot" subtitle="Membership trend over time" icon={HeartPulse}>
            <ProgramHealthChart data={dashboardData.programHealthTrend} compact />
          </SectionCard>

          <SectionCard title="Member Health Indicators" subtitle="Targets for the selected period" icon={Target} className="pb-2">
            <div className="flex min-h-0 flex-1 flex-col">
              {statusRows.map((row) => (
                <ProgramHealthSummaryRow key={row.label} {...row} compareMode={compareMode} />
              ))}
            </div>
          </SectionCard>
        </section>

        <SectionCard title="Points Economy" subtitle="Points earned vs. redeemed during selected period" icon={Coins}>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <PointsEconomyChart data={dashboardData.pointsEconomyTrend} compact />
            <div className="grid rounded-lg border border-[#edf2f7] bg-[#fbfdff] sm:grid-cols-3 xl:grid-cols-3">
              <PointsSummaryTile
                icon={ClipboardCheck}
                label="Points Issued"
                value={formatCompactValue(currentSummary.pointsIssued)}
                monthDelta={differencePercent(currentSummary.pointsIssued, previousMonthSummary.pointsIssued)}
                quarterDelta={differencePercent(currentSummary.pointsIssued, previousQuarterSummary.pointsIssued)}
                compareMode={compareMode}
              />
              <PointsSummaryTile
                icon={RefreshCcw}
                label="Points Redeemed"
                value={formatCompactValue(currentSummary.pointsRedeemed)}
                monthDelta={differencePercent(currentSummary.pointsRedeemed, previousMonthSummary.pointsRedeemed)}
                quarterDelta={differencePercent(currentSummary.pointsRedeemed, previousQuarterSummary.pointsRedeemed)}
                compareMode={compareMode}
              />
              <PointsSummaryTile
                icon={Coins}
                label="Outstanding Liability"
                value={formatCompactValue(currentSummary.pointsLiability)}
                monthDelta={differencePercent(currentSummary.pointsLiability, previousMonthSummary.pointsLiability)}
                quarterDelta={differencePercent(currentSummary.pointsLiability, previousQuarterSummary.pointsLiability)}
                compareMode={compareMode}
              />
            </div>
          </div>
        </SectionCard>

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.9fr)]">
          <SectionCard title="A. Campaign & Reward Performance" subtitle="Top 5 active campaigns and rewards" icon={Megaphone}>
            <div className="grid gap-5 lg:grid-cols-2">
              <PerformanceTable<PerformanceRow>
                title="Top 5 Active Campaigns"
                subtitle="Campaign performance"
                rows={topCampaignRows}
                emptyState="No campaign performance data is available for the selected range."
                columns={[
                  { key: "name", label: "Campaign", render: (row) => row.name },
                  {
                    key: "status",
                    label: "Status",
                    align: "right",
                    render: (row) => (
                      <span className="inline-flex items-center justify-end gap-1 text-[#0f766e]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0f8a63]" />
                        {row.status}
                      </span>
                    ),
                  },
                  { key: "redemptions", label: "Redemptions", align: "right", render: (row) => integerFormatter.format(row.redemptions) },
                  { key: "rate", label: "Engagement", align: "right", render: (row) => `${singleDecimalFormatter.format(row.rate)}%` },
                ]}
                footerHref="/admin/rewards#rewards-campaigns"
                footerLabel="View all campaigns"
              />

              <PerformanceTable<PerformanceRow>
                title="Top 5 Rewards"
                subtitle="Reward performance"
                rows={topRewardRows}
                emptyState="No reward redemption data is available for the selected range."
                columns={[
                  { key: "name", label: "Reward", render: (row) => row.name },
                  {
                    key: "status",
                    label: "Status",
                    align: "right",
                    render: (row) => (
                      <span className="inline-flex items-center justify-end gap-1 text-[#0f766e]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0f8a63]" />
                        {row.status}
                      </span>
                    ),
                  },
                  { key: "redemptions", label: "Redemptions", align: "right", render: (row) => integerFormatter.format(row.redemptions) },
                  { key: "rate", label: "Redemption", align: "right", render: (row) => `${singleDecimalFormatter.format(row.rate)}%` },
                ]}
                footerHref="/admin/rewards"
                footerLabel="View all rewards"
              />
            </div>
          </SectionCard>

          <SectionCard title="B. Action Center" subtitle="Operational alerts and next actions" icon={TriangleAlert}>
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              {visibleActionCenterItems.map((item) => (
                <ActionCenterCard key={item.label} item={item} />
              ))}
            </div>
            {monitoredActionCount > 0 ? (
              <Link to="/admin/engagement" className="mt-2.5 inline-flex h-8 items-center justify-center rounded-md border border-[#c7d9ee] bg-white px-3 text-[11px] font-black text-[#071936] transition hover:border-[#9fd7dd] hover:bg-[#f4ffff]">
                Open engagement studio for {monitoredActionCount} more checks
              </Link>
            ) : null}
          </SectionCard>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 fill-[#24364f] text-[#24364f]" />
            <h2 className="text-[16px] font-extrabold text-[#18263b]">Top Activity Insights</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {insights.map((item) => (
              <InsightCard key={item.title} item={item} />
            ))}
          </div>
        </section>
      </div>

    </>
  );
}
