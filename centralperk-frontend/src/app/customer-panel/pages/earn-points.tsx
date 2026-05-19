import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  Gift,
  HeartPulse,
  MessageSquareText,
  Pill,
  Share2,
  Smartphone,
  Star,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Progress } from "../../../components/ui/progress";
import type { AppOutletContext } from "../../types/app-context";
import type { EarnOpportunity } from "../../types/loyalty";
import { awardPointsViaApi, requestJson } from "../../lib/api";
import { normalizeTierLabel } from "../../lib/loyalty-engine";
import { fetchTierRulesViaService } from "../../lib/points-service-client";
import { loadSurveyDefinitions } from "../../lib/member-engagement";
import { getMemberReferralCode, loadReferrals } from "../../lib/member-lifecycle";

type EarnStatus = "available" | "completed" | "locked" | "mobile";

type ActivityRow = {
  id?: string | number;
  transaction_id?: string | number;
  transaction_type?: string;
  change_type?: string;
  points?: number;
  points_delta?: number;
  transaction_date?: string;
  created_at?: string;
  reason?: string | null;
};

type EarnTaskView = {
  id: string;
  title: string;
  description: string;
  points: number;
  icon: LucideIcon;
  status: EarnStatus;
  statusLabel: string;
  helperText?: string;
  actionLabel: string;
  action: () => void;
  disabled?: boolean;
};

type TierRuleRow = {
  tier_label: string;
  min_points: number;
};

const defaultTierRules = [
  { name: "Bronze", min: 0 },
  { name: "Silver", min: 250 },
  { name: "Gold", min: 750 },
];

const earnActionCatalog: Array<Omit<EarnTaskView, "status" | "statusLabel" | "action" | "disabled"> & { aliases: string[] }> = [
  {
    id: "profile",
    aliases: ["E001", "profile", "complete-profile"],
    title: "Complete Your Profile",
    description: "Add contact and birthday details so pharmacy rewards stay tied to your account.",
    points: 100,
    icon: UserRound,
    helperText: "Needs profile details",
    actionLabel: "Finish Profile",
  },
  {
    id: "survey",
    aliases: ["E003", "survey", "monthly-survey"],
    title: "Monthly Survey",
    description: "Answer a short wellness feedback survey and earn bonus points after submission.",
    points: 50,
    icon: ClipboardCheck,
    helperText: "Quick win",
    actionLabel: "Open Survey",
  },
  {
    id: "referral",
    aliases: ["E004", "referral", "refer-friend"],
    title: "Refer a Friend",
    description: "Invite a friend to PharmaRewards and track their join from your referral hub.",
    points: 250,
    icon: UsersRound,
    helperText: "Test referral earn",
    actionLabel: "Test Earn",
  },
  {
    id: "review",
    aliases: ["E006", "review", "feedback"],
    title: "Leave a Review",
    description: "Submit pharmacy rewards feedback so your experience can improve.",
    points: 75,
    icon: Star,
    helperText: "Test feedback earn",
    actionLabel: "Test Earn",
  },
  {
    id: "sharing",
    aliases: ["E005", "share", "social", "follow"],
    title: "Follow / Share Health Tips",
    description: "Share a wellness or rewards card so social actions are tracked to your member history.",
    points: 30,
    icon: Share2,
    helperText: "Open sharing",
    actionLabel: "Open Social Hub",
  },
  {
    id: "sample",
    aliases: ["sample", "test", "demo"],
    title: "Sample Pharmacy Check-in",
    description: "Test the earn-points flow with a small sample award that updates your balance.",
    points: 25,
    icon: Pill,
    helperText: "Test action",
    actionLabel: "Test Earn",
  },
  {
    id: "mobile",
    aliases: ["E002", "mobile", "app"],
    title: "Download / Use Mobile App",
    description: "Verified mobile sign-ins are tracked by the mobile app flow.",
    points: 50,
    icon: Smartphone,
    helperText: "Tracked in mobile app",
    actionLabel: "Tracked in mobile app",
  },
];

function numberFormat(value: number) {
  return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString();
}

function taskPointsFromApi(apiTasks: EarnOpportunity[], config: (typeof earnActionCatalog)[number]) {
  const match = apiTasks.find((task) => {
    const key = `${task.id} ${task.title}`.toLowerCase();
    return config.aliases.some((alias) => key.includes(alias.toLowerCase()));
  });
  return Math.max(0, Number(match?.points ?? config.points));
}

function normalizeEarnedRows(rows: ActivityRow[]) {
  return rows
    .map((row) => {
      const points = Number(row.points ?? row.points_delta ?? 0);
      const type = String(row.transaction_type ?? row.change_type ?? "").toUpperCase();
      return {
        id: String(row.id ?? row.transaction_id ?? `${row.transaction_date}-${row.reason}`),
        points,
        type,
        date: String(row.transaction_date ?? row.created_at ?? new Date().toISOString()),
        reason: String(row.reason || "Points earned"),
      };
    })
    .filter((row) => row.points > 0 && !row.type.includes("REDEEM") && !row.type.includes("EXPIR"))
    .slice(0, 5);
}

function statusBadgeClass(status: EarnStatus) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "locked") return "bg-slate-100 text-slate-600 border-slate-200";
  if (status === "mobile") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-teal-50 text-teal-700 border-teal-200";
}

function EarnHeroArt() {
  return (
    <div className="relative hidden min-h-[118px] overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#e9f8ff,#f8fcff)] p-5 lg:block">
      <div className="absolute -right-6 -top-8 h-32 w-32 rounded-full bg-cyan-100/70" />
      <div className="absolute bottom-3 right-7 h-16 w-28 rounded-2xl bg-[#03a6b0] shadow-lg" />
      <div className="absolute bottom-12 right-14 h-9 w-20 rounded-xl bg-[#0d3d64]" />
      <div className="absolute bottom-9 right-16 h-12 w-4 rounded-full bg-cyan-300" />
      <div className="absolute bottom-15 right-9 h-4 w-10 rounded-full bg-cyan-300" />
      <Gift className="absolute bottom-7 right-20 h-10 w-10 text-white" />
      <HeartPulse className="absolute bottom-8 right-36 h-12 w-12 rounded-2xl bg-white p-2 text-[#03a6b0] shadow" />
    </div>
  );
}

export default function EarnPoints() {
  const { user, setUser, refreshUser } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();
  const [apiTasks, setApiTasks] = useState<EarnOpportunity[]>([]);
  const [recentEarned, setRecentEarned] = useState<ReturnType<typeof normalizeEarnedRows>>([]);
  const [surveyCount, setSurveyCount] = useState(0);
  const [referralCode, setReferralCode] = useState("");
  const [referralCount, setReferralCount] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [earningTaskId, setEarningTaskId] = useState<string | null>(null);
  const [tierRules, setTierRules] = useState(defaultTierRules);

  useEffect(() => {
    let alive = true;
    setLoadError(false);

    Promise.all([
      requestJson<{ ok: true; earnTasks: EarnOpportunity[] }>("/api/points/earn-tasks"),
      requestJson<{ ok: true; history: ActivityRow[] }>(
        `/api/points/activity?${new URLSearchParams({ memberIdentifier: user.memberId, fallbackEmail: user.email }).toString()}`,
      ),
      loadSurveyDefinitions(),
      loadReferrals(user.memberId),
      getMemberReferralCode(user.memberId, user.email),
    ])
      .then(([tasksResponse, activityResponse, surveys, referrals, code]) => {
        if (!alive) return;
        setApiTasks((tasksResponse.earnTasks || []).filter((task) => task.active !== false));
        setRecentEarned(normalizeEarnedRows(activityResponse.history || []));
        setSurveyCount(surveys.filter((survey) => survey.status === "live").length);
        setReferralCount(referrals.length);
        setReferralCode(code);
      })
      .catch((error) => {
        console.error("Earn points data failed to load", error);
        if (!alive) return;
        setLoadError(true);
      });

    return () => {
      alive = false;
    };
  }, [user.email, user.memberId]);

  useEffect(() => {
    void fetchTierRulesViaService()
      .then((response) => {
        const nextRules = new Map(defaultTierRules.map((tier) => [tier.name, tier.min]));
        for (const rule of response?.tiers ?? ([] as TierRuleRow[])) {
          const label = String(rule.tier_label || "").trim();
          const normalizedLabel = label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
          if (!["Bronze", "Silver", "Gold"].includes(normalizedLabel)) continue;
          nextRules.set(normalizedLabel, Math.max(0, Number(rule.min_points) || 0));
        }
        setTierRules(Array.from(nextRules.entries()).map(([name, min]) => ({ name, min })).sort((a, b) => a.min - b.min));
      })
      .catch(() => undefined);
  }, []);

  const monthlyEarned = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const earnedFromHistory = recentEarned
      .filter((row) => row.date.slice(0, 7) === currentMonth)
      .reduce((sum, row) => sum + row.points, 0);
    return Math.max(Number(user.earnedThisMonth || 0), earnedFromHistory);
  }, [recentEarned, user.earnedThisMonth]);

  const profileProgress = useMemo(() => {
    const fields = [user.fullName, user.email, user.phone, user.birthdate, user.address].filter((value) => String(value || "").trim());
    return Math.min(100, Math.round((fields.length / 5) * 100));
  }, [user.address, user.birthdate, user.email, user.fullName, user.phone]);

  const tierProgress = useMemo(() => {
    const currentTierIndex = tierRules.findIndex((tier) => tier.name.toLowerCase() === String(user.tier || "").toLowerCase());
    const resolvedCurrent =
      currentTierIndex >= 0
        ? tierRules[currentTierIndex]
        : [...tierRules].reverse().find((tier) => user.points >= tier.min) ?? tierRules[0];
    const resolvedIndex = tierRules.findIndex((tier) => tier.name === resolvedCurrent.name);
    const nextTier = tierRules[resolvedIndex + 1] ?? null;

    if (!nextTier) {
      const momentumGoal = Math.max(1000, Math.ceil(Math.max(user.earnedThisMonth, 0) / 1000) * 1000 + 1000);
      return {
        label: `${resolvedCurrent.name} tier unlocked`,
        currentLabel: `${numberFormat(user.earnedThisMonth)} pts this month`,
        goalLabel: `${numberFormat(momentumGoal)} pts monthly streak goal`,
        remainingLabel: `${numberFormat(Math.max(0, momentumGoal - user.earnedThisMonth))} pts to next streak reward`,
        percent: Math.min(100, Math.max(0, (user.earnedThisMonth / momentumGoal) * 100)),
      };
    }

    const base = resolvedCurrent.min;
    const span = Math.max(1, nextTier.min - base);
    return {
      label: `${resolvedCurrent.name} tier progress`,
      currentLabel: `${numberFormat(user.points)} pts current`,
      goalLabel: `${numberFormat(nextTier.min)} pts ${nextTier.name}`,
      remainingLabel: `${numberFormat(Math.max(0, nextTier.min - user.points))} pts to ${nextTier.name}`,
      percent: Math.min(100, Math.max(0, ((user.points - base) / span) * 100)),
    };
  }, [tierRules, user.earnedThisMonth, user.points, user.tier]);

  const handleTestEarn = useCallback(async (taskId: string, title: string, points: number) => {
    if (earningTaskId) return;
    try {
      setEarningTaskId(taskId);
      const response = await awardPointsViaApi({
        memberIdentifier: user.memberId,
        fallbackEmail: user.email,
        points,
        transactionType: "EARN",
        reason: `Sample earn task: ${title}`,
      });
      const pointsAdded = Math.max(0, Number(response.result.pointsAdded || points));
      const newBalance = Math.max(0, Number(response.result.newBalance || user.points + pointsAdded));
      setUser((prev) => ({
        ...prev,
        points: newBalance,
        tier: normalizeTierLabel(response.result.newTier || prev.tier),
        earnedThisMonth: Math.max(0, Number(prev.earnedThisMonth || 0) + pointsAdded),
        transactions: [
          {
            id: `sample-${taskId}-${Date.now()}`,
            type: "earned",
            description: `Sample earn task: ${title}`,
            date: new Date().toISOString(),
            points: pointsAdded,
            balance: newBalance,
            category: "Earn Points",
          },
          ...prev.transactions,
        ],
      }));
      await refreshUser();
      toast.success(`+${numberFormat(pointsAdded)} points added.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sample earn failed.");
    } finally {
      setEarningTaskId(null);
    }
  }, [earningTaskId, refreshUser, setUser, user.email, user.memberId, user.points]);

  const tasks = useMemo<EarnTaskView[]>(() => {
    return earnActionCatalog.map((config) => {
      const points = taskPointsFromApi(apiTasks, config);
      if (config.id === "sample") {
        return {
          ...config,
          points,
          status: "available",
          statusLabel: "Available",
          helperText: "Adds points from this page",
          action: () => handleTestEarn(config.id, config.title, points),
          disabled: Boolean(earningTaskId),
          actionLabel: earningTaskId === config.id ? "Adding..." : "Test Earn",
        };
      }

      if (config.id === "profile") {
        const completed = Boolean(user.profileComplete);
        return {
          ...config,
          points,
          status: completed ? "completed" : "available",
          statusLabel: completed ? "Completed" : "Available",
          helperText: completed ? "Profile details are complete" : `${profileProgress}% profile complete`,
          action: () => navigate("/customer/profile"),
          disabled: false,
          actionLabel: completed ? "View Profile" : "Finish Profile",
        };
      }

      if (config.id === "survey") {
        const completed = Number(user.surveysCompleted || 0) > 0 && surveyCount === 0;
        return {
          ...config,
          points,
          status: completed ? "completed" : surveyCount > 0 ? "available" : "locked",
          statusLabel: completed ? "Completed" : "Available",
          helperText: surveyCount > 0 ? `${surveyCount} survey${surveyCount === 1 ? "" : "s"} ready` : "Sample survey earn",
          action: () => handleTestEarn(config.id, config.title, points),
          disabled: Boolean(earningTaskId),
          actionLabel: earningTaskId === config.id ? "Adding..." : "Test Earn",
        };
      }

      if (config.id === "referral") {
        return {
          ...config,
          points,
          status: "available",
          statusLabel: referralCount > 0 ? `${referralCount} tracked` : "Available",
          helperText: referralCode ? `Code ${referralCode}` : "Create your referral code",
          action: () => handleTestEarn(config.id, config.title, points),
          disabled: Boolean(earningTaskId),
          actionLabel: earningTaskId === config.id ? "Adding..." : "Test Earn",
        };
      }

      if (config.id === "review") {
        return {
          ...config,
          points,
          status: "available",
          statusLabel: "Available",
          action: () => handleTestEarn(config.id, config.title, points),
          disabled: Boolean(earningTaskId),
          actionLabel: earningTaskId === config.id ? "Adding..." : "Test Earn",
        };
      }

      if (config.id === "sharing") {
        return {
          ...config,
          points,
          status: "available",
          statusLabel: "Available",
          action: () => handleTestEarn(config.id, config.title, points),
          disabled: Boolean(earningTaskId),
          actionLabel: earningTaskId === config.id ? "Adding..." : "Test Earn",
        };
      }

      return {
        ...config,
        points,
        status: user.hasDownloadedApp ? "completed" : "mobile",
        statusLabel: user.hasDownloadedApp ? "Completed" : "Mobile only",
        helperText: user.hasDownloadedApp ? "Mobile app activity verified" : "Tracked in mobile app",
        action: () => undefined,
        disabled: true,
      };
    });
  }, [
    apiTasks,
    earningTaskId,
    handleTestEarn,
    navigate,
    profileProgress,
    referralCode,
    referralCount,
    surveyCount,
    user.hasDownloadedApp,
    user.profileComplete,
    user.surveysCompleted,
  ]);

  const bestWays = tasks.slice(0, 3);
  const recommendedTaskId = !user.profileComplete ? "profile" : surveyCount > 0 ? "survey" : referralCount === 0 ? "referral" : "sharing";
  const recommendedTask = tasks.find((task) => task.id === recommendedTaskId);

  return (
    <div className="mx-auto max-w-[1180px] space-y-5 px-4 py-5 sm:px-5 lg:px-6">
      <section className="grid gap-4 rounded-[16px] border border-[#bfe9e4] bg-[linear-gradient(135deg,#ffffff_0%,#f4fffb_100%)] p-5 shadow-[0_12px_28px_rgba(0,96,86,0.07)] lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col justify-between gap-5">
          <div>
            <div className="inline-flex items-center rounded-full border border-[#bfe5e8] bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#007d87]">
              Pharmacy Rewards
            </div>
            <h1 className="mt-3 text-[28px] font-extrabold leading-tight text-[#071a35] md:text-[30px]">Earn Points</h1>
            <p className="mt-2 max-w-2xl text-sm text-[#56657a] md:text-[15px]">
              Complete pharmacy rewards actions to grow your balance.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#dce7f3] bg-[#f8fcff] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">Points Balance</p>
              <p className="mt-2 text-2xl font-bold text-[#10213a]">{numberFormat(user.points)}</p>
            </div>
            <div className="rounded-2xl border border-[#dce7f3] bg-[#f8fcff] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">Tier</p>
              <p className="mt-2 text-2xl font-bold text-[#10213a]">{user.tier}</p>
            </div>
            <div className="rounded-2xl border border-[#dce7f3] bg-[#f8fcff] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">Monthly Earned</p>
              <p className="mt-2 text-2xl font-bold text-[#008d97]">{numberFormat(monthlyEarned)}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#dce7f3] bg-[#fbfdff] p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-bold text-[#10213a]">{tierProgress.label}</p>
              <p className="text-sm font-bold text-[#008d97]">{tierProgress.remainingLabel}</p>
            </div>
            <Progress value={tierProgress.percent} className="h-2.5 bg-[#e8edf3] [&>div]:bg-[#d9a719]" />
            <div className="mt-3 flex flex-wrap justify-between gap-3 text-xs font-semibold text-[#64748b]">
              <span>{tierProgress.currentLabel}</span>
              <span>{tierProgress.goalLabel}</span>
            </div>
          </div>
        </div>
        <EarnHeroArt />
      </section>

      {loadError ? (
        <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Earn points data could not load. Please try again.
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        {bestWays.map((task) => {
          const Icon = task.icon;
          return (
            <Card key={task.id} className="border-[#dce7f3] bg-white p-5 shadow-[0_10px_24px_rgba(15,35,60,0.05)]">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8f8f7] text-[#008d97]">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-[#10213a]">{task.title.replace("Your ", "")}</h2>
                    <Badge variant="outline" className={statusBadgeClass(task.status)}>
                      {task.statusLabel}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-[#56657a]">{task.description}</p>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                      +{numberFormat(task.points)} pts
                    </span>
                    <Button
                      size="sm"
                      disabled={task.disabled}
                      onClick={task.action}
                      className="bg-[#008d97] text-white hover:bg-[#007982] disabled:bg-slate-200 disabled:text-slate-500"
                    >
                      {task.actionLabel}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      <section className="rounded-[24px] border border-[#dce7f3] bg-white p-5 shadow-[0_12px_30px_rgba(15,35,60,0.06)]">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#10213a]">Available Tasks</h2>
            <p className="text-sm text-[#667085]">Choose a pharmacy rewards action and continue in the right customer workflow.</p>
          </div>
          <Badge className="w-fit bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
            {tasks.filter((task) => task.status === "available").length} tasks ready
          </Badge>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {tasks.map((task) => {
            const Icon = task.icon;
            return (
              <div key={task.id} className="rounded-2xl border border-[#dce7f3] bg-[#fbfdff] p-4 transition hover:border-[#9edce0]">
                <div className="flex gap-4">
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-[#edf7fb] text-[#008d97]">
                    <Icon className="h-7 w-7" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-[15px] font-bold text-[#10213a]">{task.title}</h3>
                        <p className="mt-1 text-sm leading-5 text-[#56657a]">{task.description}</p>
                      </div>
                      <span className="rounded-lg bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
                        +{numberFormat(task.points)}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <Badge variant="outline" className={statusBadgeClass(task.status)}>
                          {task.statusLabel}
                        </Badge>
                        {task.helperText ? <p className="mt-1 text-xs text-[#7a8799]">{task.helperText}</p> : null}
                      </div>
                      <Button
                        disabled={task.disabled}
                        onClick={task.action}
                        className="bg-[#008d97] text-white hover:bg-[#007982] disabled:bg-slate-200 disabled:text-slate-600"
                      >
                        {task.actionLabel}
                        {!task.disabled ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card className="border-[#dce7f3] bg-white p-5 shadow-[0_10px_24px_rgba(15,35,60,0.05)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#10213a]">Recently Earned</h2>
              <p className="text-sm text-[#667085]">Last 5 earning transactions from the points service.</p>
            </div>
            <Button variant="outline" className="border-[#bfd3ea] text-[#10213a]" onClick={() => navigate("/customer/activity")}>
              View full activity
            </Button>
          </div>

          {recentEarned.length > 0 ? (
            <div className="divide-y divide-[#e5edf6]">
              {recentEarned.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                      <BadgeCheck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#10213a]">{row.reason}</p>
                      <p className="text-xs text-[#7a8799]">{new Date(row.date).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-emerald-700">+{numberFormat(row.points)} pts</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#c8d8eb] bg-[#f8fbff] p-6 text-center">
              <Pill className="mx-auto h-8 w-8 text-[#008d97]" />
              <p className="mt-3 text-sm font-medium text-[#10213a]">Nothing earned yet.</p>
              <p className="mt-1 text-sm text-[#667085]">Complete an available task to start earning points.</p>
            </div>
          )}
        </Card>

        <Card className="border-[#dce7f3] bg-[#f8fcff] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-[#008d97]">
              <MessageSquareText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#10213a]">Best next step</h2>
              <p className="text-sm text-[#667085]">Based on your current account state.</p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-[#dce7f3] bg-white p-4">
            <p className="text-sm font-semibold text-[#10213a]">
              {!user.profileComplete
                ? "Finish your profile"
                : surveyCount > 0
                  ? "Answer a survey"
                  : referralCount === 0
                    ? "Invite a friend"
                    : "Share a wellness tip"}
            </p>
            <p className="mt-2 text-sm text-[#667085]">
              {!user.profileComplete
                ? "Profile details unlock stronger rewards personalization."
                : surveyCount > 0
                  ? "Live surveys are available and can add points after submit."
                  : referralCount === 0
                    ? "Your referral code can bring tracked joins into your rewards account."
                    : "Sharing keeps your member activity moving."}
            </p>
            <Button
              className="mt-4 w-full bg-[#10213a] text-white hover:bg-[#173454]"
              disabled={Boolean(earningTaskId)}
              onClick={() => {
                if (!user.profileComplete) navigate("/customer/profile");
                else recommendedTask?.action();
              }}
            >
              {earningTaskId ? "Adding..." : "Continue"}
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
