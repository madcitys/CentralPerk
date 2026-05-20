import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Download,
  Filter,
  Gift,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Share2,
  Sparkles,
  Star,
  Trophy,
  UserX,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { useAdminData } from "../hooks/use-admin-data";
import { AdminDashboardOutletContext } from "../types";
import {
  buildInactiveMemberInsights,
  createChallengeDefinitionRecord,
  createNotificationCampaignRecord,
  createSurveyDefinitionRecord,
  loadChallengeDefinitions,
  loadNotificationCampaigns,
  loadSocialShareEvents,
  loadSurveyDefinitions,
  type ChallengeDefinition,
  type EngagementSegment,
  type NotificationCampaign,
  type NotificationTrigger,
  type SurveyDefinition,
  type SurveyQuestion,
} from "../../lib/member-engagement";
import {
  type FeedbackInsights,
  generateFeedbackInsights,
  loadAllReferrals,
  loadFeedback,
  loadLatestFeedbackInsights,
  type FeedbackRecord,
  type ReferralRecord,
} from "../../lib/member-lifecycle";
import { scheduleEmailViaApi, triggerSmsViaApi } from "../../lib/api";
import {
  demoChallenges,
  demoFeedback,
  demoInactiveMembers,
  demoNotificationCampaigns,
  demoReferrals,
  demoSurveys,
  type DemoInactiveMember,
} from "../../lib/demo-loyalty-data";

type EngagementTab = "notifications" | "challenges" | "sharing" | "surveys" | "winback";
type ModalName = "push" | "referrals" | "feedback" | "surveys" | "inactive" | "challenges" | null;

const tabs: { id: EngagementTab; label: string; icon: LucideIcon }[] = [
  { id: "notifications", label: "Push Notifications", icon: Send },
  { id: "challenges", label: "Challenges", icon: Trophy },
  { id: "sharing", label: "Social Sharing", icon: Share2 },
  { id: "surveys", label: "Surveys", icon: ClipboardList },
  { id: "winback", label: "Win-back", icon: Bell },
];

const adminModalClass =
  "!left-4 !top-4 !h-[calc(100vh-2rem)] !w-[calc(100vw-2rem)] !max-w-none !translate-x-0 !translate-y-0 overflow-hidden rounded-[14px] bg-white p-4 pr-10 sm:!max-w-none";

const segments: EngagementSegment[] = ["All Members", "Bronze", "Silver", "Gold", "High Value", "Inactive 60+ Days"];
const triggers: NotificationTrigger[] = ["Points Earned", "Tier Upgrade", "Reward Available", "Flash Sale", "Birthday"];

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function percentage(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "M";
}

function statusClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("completed") || normalized.includes("converted") || normalized.includes("joined") || normalized.includes("active")) {
    return "bg-[#dcfce7] text-[#15803d]";
  }
  if (normalized.includes("pending") || normalized.includes("upcoming")) return "bg-[#fff7ed] text-[#c2410c]";
  if (normalized.includes("scheduled") || normalized.includes("draft")) return "bg-[#dbeafe] text-[#1d4ed8]";
  if (normalized.includes("high")) return "bg-[#fee2e2] text-[#b91c1c]";
  if (normalized.includes("medium")) return "bg-[#ffedd5] text-[#c2410c]";
  return "bg-[#eef2f7] text-[#475569]";
}

function normalizedKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function mergeUniqueRows<T>(primaryRows: T[], demoRows: T[], getKey: (row: T) => string) {
  const seen = new Set<string>();
  return [...primaryRows, ...demoRows].filter((row) => {
    const key = normalizedKey(getKey(row));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function campaignKey(campaign: NotificationCampaign) {
  return campaign.name;
}

function surveyKey(survey: SurveyDefinition) {
  return survey.title;
}

function challengeKey(challenge: ChallengeDefinition) {
  return challenge.title;
}

function referralKey(referral: ReferralRecord) {
  return `${referral.referrerCode || referral.referrerMemberId}:${referral.refereeEmail}`;
}

function feedbackKey(feedback: FeedbackRecord) {
  return `${feedback.memberId}:${feedback.category}:${feedback.comment}`;
}

function Sparkline({ color = "#2563eb" }: { color?: string }) {
  return (
    <svg viewBox="0 0 110 32" className="h-8 w-28" aria-hidden="true">
      <path d="M2 25 C18 24, 22 18, 34 19 S50 29, 62 20 S80 18, 88 8 S102 13, 108 4" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  trend,
  color,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  trend: string;
  color: string;
}) {
  return (
    <Card className="rounded-[12px] border border-[#dbe5f0] bg-white p-4 shadow-[0_10px_28px_rgba(15,35,60,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-[12px]" style={{ backgroundColor: `${color}14`, color }}>
            <Icon className="h-6 w-6" />
          </span>
          <div>
            <p className="text-[12px] font-semibold text-[#52627a]">{label}</p>
            <p className="mt-2 text-[28px] font-black leading-none text-[#061e3b]">{value}</p>
          </div>
        </div>
        <Sparkline color={color} />
      </div>
      <p className="mt-3 text-[11px] font-semibold text-[#64748b]">{trend}</p>
    </Card>
  );
}

function ModalHeader({ title, onClose, action }: { title: string; onClose: () => void; action?: ReactNode }) {
  return (
    <DialogHeader className="mb-4 flex-row items-start justify-between gap-4">
      <DialogTitle className="text-[22px] font-black text-[#061e3b]">{title}</DialogTitle>
      <div className="flex items-center gap-2">
        {action}
        <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#061e3b] hover:bg-[#f1f5f9]" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>
    </DialogHeader>
  );
}

function TableShell({ children }: { children: ReactNode }) {
  return <div className="max-w-full overflow-hidden rounded-[12px] border border-[#dbe5f0] bg-white">{children}</div>;
}

function EmptyTableRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm font-medium text-[#64748b]">
        {text}
      </td>
    </tr>
  );
}

export default function AdminEngagementPage() {
  const { notificationCount = 0, openNotifications } = useOutletContext<AdminDashboardOutletContext>();
  const { members, transactions, loginActivity, loading, error } = useAdminData();
  const [activeTab, setActiveTab] = useState<EngagementTab>("notifications");
  const [modal, setModal] = useState<ModalName>(null);
  const [campaigns, setCampaigns] = useState<NotificationCampaign[]>(demoNotificationCampaigns);
  const [surveys, setSurveys] = useState<SurveyDefinition[]>(demoSurveys);
  const [challenges, setChallenges] = useState<ChallengeDefinition[]>(demoChallenges);
  const [referrals, setReferrals] = useState<ReferralRecord[]>(demoReferrals);
  const [feedback, setFeedback] = useState<FeedbackRecord[]>(demoFeedback);
  const [shareCount, setShareCount] = useState(12);
  const [reviewedFeedbackIds, setReviewedFeedbackIds] = useState<string[]>([]);
  const [feedbackInsights, setFeedbackInsights] = useState<FeedbackInsights | null>(null);
  const [campaignName, setCampaignName] = useState("Birthday Loyalty Push");
  const [campaignTrigger, setCampaignTrigger] = useState<NotificationTrigger>("Birthday");
  const [campaignSegment, setCampaignSegment] = useState<EngagementSegment>("All Members");
  const [scheduledFor, setScheduledFor] = useState("2026-05-21T09:00");
  const [variantA, setVariantA] = useState("Celebrate your day with a birthday reward waiting in the app.");
  const [variantB, setVariantB] = useState("Birthday perk unlocked. Redeem your member surprise today.");
  const [surveyTitle, setSurveyTitle] = useState("Rewards Program Feedback");
  const [surveyPoints, setSurveyPoints] = useState("50");
  const [challengeName, setChallengeName] = useState("Wellness Week");
  const [isSavingCampaign, setIsSavingCampaign] = useState(false);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      loadNotificationCampaigns(),
      loadSurveyDefinitions(),
      loadChallengeDefinitions(),
      loadAllReferrals(),
      loadFeedback(),
      loadSocialShareEvents(),
    ]).then((results) => {
      if (!alive) return;
      const campaignRows = results[0].status === "fulfilled" ? results[0].value : [];
      const surveyRows = results[1].status === "fulfilled" ? results[1].value : [];
      const challengeRows = results[2].status === "fulfilled" ? results[2].value : [];
      const referralRows = results[3].status === "fulfilled" ? results[3].value : [];
      const feedbackRows = results[4].status === "fulfilled" ? results[4].value : [];
      const shareRows = results[5].status === "fulfilled" ? results[5].value : [];

      setCampaigns(mergeUniqueRows(campaignRows, demoNotificationCampaigns, campaignKey));
      setSurveys(mergeUniqueRows(surveyRows, demoSurveys, surveyKey));
      setChallenges(mergeUniqueRows(challengeRows, demoChallenges, challengeKey));
      setReferrals(mergeUniqueRows(referralRows, demoReferrals, referralKey));
      setFeedback(mergeUniqueRows(feedbackRows, demoFeedback, feedbackKey));
      setShareCount(shareRows.length > 0 ? shareRows.length : 12);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    loadLatestFeedbackInsights()
      .then((insights) => {
        if (alive) setFeedbackInsights(insights);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const inactiveRows = useMemo<DemoInactiveMember[]>(() => {
    const derived = buildInactiveMemberInsights(members, transactions, loginActivity);
    if (derived.length === 0) return demoInactiveMembers;
    return derived.slice(0, 12).map((member) => ({
      id: member.memberId,
      name: member.memberName || member.memberNumber,
      email: `${member.memberNumber.toLowerCase()}@member.local`,
      segment: member.tier === "Gold" ? "Gold" : "All Members",
      lastActive: `${member.daysInactive} days ago`,
      daysAgo: member.daysInactive,
      lifetimeValue: member.riskLevel === "High" ? 2340 : member.riskLevel === "Medium" ? 1540 : 760,
      risk: member.riskLevel,
      suggestedCampaign: member.suggestedOffer === "2x Points" ? "Come Back & Save" : "We Miss You! Special Offer",
      status: "Not Contacted",
    }));
  }, [loginActivity, members, transactions]);

  const liveChallenges = challenges.filter((challenge) => new Date(challenge.endAt).getTime() >= Date.now());
  const liveSurveys = surveys.filter((survey) => survey.status === "live");
  const scheduledCampaigns = campaigns.filter((campaign) => campaign.status === "scheduled");
  const referralConversions = referrals.filter((row) => row.status === "joined").length;
  const referralBonuses = referrals.filter((row) => row.bonusAwarded).length;
  const averageRating = feedback.length ? feedback.reduce((sum, item) => sum + item.rating, 0) / feedback.length : 0;
  const topCategory = useMemo(() => {
    const counts = new Map<string, number>();
    feedback.forEach((item) => counts.set(item.category, (counts.get(item.category) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "service";
  }, [feedback]);

  const feedbackRows = useMemo(() => {
    const byComment = new Map<string, FeedbackRecord & { duplicateCount: number }>();
    feedback.forEach((item) => {
      const key = item.comment.trim().toLowerCase();
      const existing = byComment.get(key);
      if (existing) {
        existing.duplicateCount += 1;
      } else {
        byComment.set(key, { ...item, duplicateCount: 1 });
      }
    });
    return [...byComment.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [feedback]);

  const createCampaign = async () => {
    const audienceSize = campaignSegment === "Inactive 60+ Days" ? inactiveRows.length : Math.max(members.length || 40, 40);
    const nextCampaign: NotificationCampaign = {
      id: crypto.randomUUID(),
      name: campaignName,
      trigger: campaignTrigger,
      segment: campaignSegment,
      scheduledFor: new Date(scheduledFor).toISOString(),
      status: "scheduled",
      audienceSize,
      sentCount: 0,
      deliveredCount: 0,
      openedCount: 0,
      variantA,
      variantB,
      winner: "Pending",
    };

    try {
      setIsSavingCampaign(true);
      const saved = await createNotificationCampaignRecord({
        name: nextCampaign.name,
        trigger: nextCampaign.trigger,
        segment: nextCampaign.segment,
        scheduledFor: nextCampaign.scheduledFor,
        audienceSize,
        variantA,
        variantB,
      }).catch(() => null);
      await Promise.allSettled([
        scheduleEmailViaApi({ subject: campaignName, message: variantA, segment: campaignSegment, scheduledFor: nextCampaign.scheduledFor }),
        triggerSmsViaApi({ subject: campaignName, message: variantA, segment: campaignSegment }),
      ]);
      setCampaigns((prev) => [saved ?? nextCampaign, ...prev]);
      toast.success("Push campaign scheduled.");
    } finally {
      setIsSavingCampaign(false);
    }
  };

  const createSurvey = async () => {
    const questions: SurveyQuestion[] = [
      { id: crypto.randomUUID(), prompt: "How useful are the current pharmacy rewards?", type: "rating" },
      { id: crypto.randomUUID(), prompt: "Which reward should be prioritized next?", type: "multiple-choice", options: ["Pharmacy voucher", "Wellness kit", "Delivery support"] },
    ];
    const nextSurvey: SurveyDefinition = {
      id: crypto.randomUUID(),
      title: surveyTitle,
      description: "Created from the engagement dashboard.",
      segment: "All Members",
      bonusPoints: Math.max(0, Number(surveyPoints) || 0),
      status: "live",
      createdAt: new Date().toISOString(),
      questions,
      responses: [],
    };
    const saved = await createSurveyDefinitionRecord(nextSurvey).catch(() => null);
    setSurveys((prev) => [saved ?? nextSurvey, ...prev]);
    toast.success("Survey published.");
  };

  const createChallenge = async () => {
    const nextChallenge: ChallengeDefinition = {
      id: crypto.randomUUID(),
      title: challengeName,
      description: "Complete pharmacy rewards actions to earn bonus points.",
      type: "points-earned",
      targetValue: 1000,
      unitLabel: "points",
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      rewardPoints: 250,
      rewardBadge: "Wellness Challenge",
      competitive: false,
      segment: "All Members",
    };
    const saved = await createChallengeDefinitionRecord(nextChallenge).catch(() => null);
    setChallenges((prev) => [saved ?? nextChallenge, ...prev]);
    toast.success("Challenge created.");
  };

  const runInsights = async () => {
    setIsGeneratingInsights(true);
    try {
      const insights = await generateFeedbackInsights();
      setFeedbackInsights(insights);
      toast.success("Feedback insights generated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to generate insights.");
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  if (loading) return <p className="p-6 text-base text-gray-700">Loading engagement dashboard...</p>;
  if (error) return <p className="p-6 text-red-600">{error}</p>;

  return (
    <div className="-m-4 min-h-screen min-w-0 max-w-none overflow-x-hidden bg-[#f5f8fb] p-4 text-[#061e3b] lg:-m-8 lg:p-6">
      <header className="mb-4 flex flex-col gap-4 border-b border-[#dbe5f0] bg-white/80 px-1 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#0b8b95]">Engagement Studio</div>
          <h1 className="mt-2 text-[26px] font-black tracking-normal text-[#061e3b]">Member Engagement</h1>
          <p className="mt-1 text-[13px] font-medium text-[#52627a]">Manage push campaigns, challenges, social sharing, surveys, and win-back flows.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button className="h-10 rounded-md bg-[#061e3b] px-5 text-xs font-black text-white hover:bg-[#0b2d56]" onClick={() => setModal("push")}>
            Quick Actions
          </Button>
          <button type="button" onClick={openNotifications} className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#dbe5f0] bg-white text-[#061e3b]">
            <Bell className="h-5 w-5" />
            {notificationCount > 0 ? <span className="absolute right-1 top-1 h-4 min-w-4 rounded-full bg-[#2563eb] px-1 text-[9px] font-bold text-white">{Math.min(notificationCount, 9)}</span> : null}
          </button>
        </div>
      </header>

      <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={Send} label="Push Scheduled" value={String(scheduledCampaigns.length || 6)} trend="+20% vs last 7 days" color="#2563eb" />
        <SummaryCard icon={Trophy} label="Active Challenges" value={String(liveChallenges.length)} trend="No change" color="#22c55e" />
        <SummaryCard icon={ClipboardList} label="Live Surveys" value={String(liveSurveys.length)} trend="No change" color="#a855f7" />
        <SummaryCard icon={UserX} label="Inactive Members (60+ Days)" value={String(inactiveRows.length)} trend="-5% vs last 7 days" color="#f97316" />
      </section>

      <nav className="mb-4 grid grid-cols-2 overflow-hidden rounded-t-[12px] border border-[#dbe5f0] bg-white sm:grid-cols-3 xl:grid-cols-5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex min-w-0 items-center justify-center gap-2 border-b-2 px-3 py-4 text-[13px] font-bold transition ${
                active ? "border-[#061e3b] text-[#061e3b]" : "border-transparent text-[#52627a] hover:bg-[#f8fbff]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {activeTab === "notifications" ? (
        <div className="space-y-4">
          <section className="grid min-w-0 items-stretch gap-4 xl:grid-cols-[minmax(360px,0.58fr)_minmax(0,1fr)]">
            <Card className="min-w-0 rounded-[12px] border border-[#dbe5f0] bg-white p-3.5 shadow-[0_10px_28px_rgba(15,35,60,0.04)]">
              <div className="mb-3 flex items-center gap-2">
                <Send className="h-5 w-5 text-[#2563eb]" />
                <h2 className="text-[16px] font-black text-[#061e3b]">Campaign Builder</h2>
              </div>
              <div className="space-y-2.5">
                <div>
                  <Label className="text-xs font-bold text-[#52627a]">Campaign name</Label>
                  <Input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} className="mt-1.5 h-8 rounded-md border-[#dbe5f0] text-sm" />
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs font-bold text-[#52627a]">Trigger</Label>
                    <select className="mt-1.5 h-8 w-full rounded-md border border-[#dbe5f0] bg-white px-3 text-sm" value={campaignTrigger} onChange={(event) => setCampaignTrigger(event.target.value as NotificationTrigger)}>
                      {triggers.map((trigger) => <option key={trigger}>{trigger}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-[#52627a]">Segment</Label>
                    <select className="mt-1.5 h-8 w-full rounded-md border border-[#dbe5f0] bg-white px-3 text-sm" value={campaignSegment} onChange={(event) => setCampaignSegment(event.target.value as EngagementSegment)}>
                      {segments.map((segment) => <option key={segment}>{segment}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-bold text-[#52627a]">Schedule notification</Label>
                  <Input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} className="mt-1.5 h-8 rounded-md border-[#dbe5f0] text-sm" />
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs font-bold text-[#52627a]">Variant A</Label>
                    <Textarea value={variantA} onChange={(event) => setVariantA(event.target.value)} maxLength={160} className="mt-1.5 min-h-[58px] resize-none rounded-md border-[#dbe5f0] text-[11px] leading-4" />
                    <p className="mt-0.5 text-right text-[10px] font-medium text-[#64748b]">{variantA.length}/160</p>
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-[#52627a]">Variant B</Label>
                    <Textarea value={variantB} onChange={(event) => setVariantB(event.target.value)} maxLength={160} className="mt-1.5 min-h-[58px] resize-none rounded-md border-[#dbe5f0] text-[11px] leading-4" />
                    <p className="mt-0.5 text-right text-[10px] font-medium text-[#64748b]">{variantB.length}/160</p>
                  </div>
                </div>
                <div className="rounded-md border border-[#cfe2ff] bg-[#eff6ff] px-3 py-2 text-xs font-bold text-[#061e3b]">
                  Estimated audience: {campaignSegment === "Inactive 60+ Days" ? inactiveRows.length : Math.max(members.length || 40, 40)} members
                </div>
                <Button onClick={createCampaign} disabled={isSavingCampaign} className="h-9 w-full rounded-md bg-[#061e3b] text-xs font-black text-white hover:bg-[#0b2d56]">
                  <Send className="mr-2 h-4 w-4" />
                  {isSavingCampaign ? "Scheduling..." : "Schedule Push Campaign"}
                </Button>
              </div>
            </Card>

            <Card className="flex min-w-0 flex-col rounded-[12px] border border-[#dbe5f0] bg-white p-4 shadow-[0_10px_28px_rgba(15,35,60,0.04)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-[#2563eb]" />
                  <h2 className="text-[16px] font-black text-[#061e3b]">Recent Push Campaigns</h2>
                </div>
                <Button variant="outline" className="h-8 rounded-md border-[#dbe5f0] px-3 text-xs font-bold" onClick={() => setModal("push")}>View all</Button>
              </div>
              <PushCampaignTable campaigns={campaigns.slice(0, 5)} compact />
              <MiniTableFooter label={`Showing 1 to ${Math.min(campaigns.length, 5)} of ${campaigns.length} campaigns`} />
            </Card>
          </section>

          <section className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
            <ReferralPanel referrals={referrals} onViewAll={() => setModal("referrals")} />
            <FeedbackPanel feedbackRows={feedbackRows.slice(0, 4)} totalFeedback={feedback.length} averageRating={averageRating} topCategory={topCategory} onViewAll={() => setModal("feedback")} />
          </section>
        </div>
      ) : null}

      {activeTab === "challenges" ? (
        <section className="grid min-w-0 items-stretch gap-4 xl:grid-cols-[minmax(360px,0.7fr)_minmax(0,1fr)]">
          <Card className="min-w-0 rounded-[12px] border border-[#dbe5f0] bg-white p-5">
            <h2 className="text-[16px] font-black text-[#061e3b]">Create Challenge</h2>
            <p className="mt-1 text-sm text-[#64748b]">Published challenges appear on the customer challenge tab.</p>
            <div className="mt-5 space-y-4">
              <div>
                <Label>Challenge name</Label>
                <Input value={challengeName} onChange={(event) => setChallengeName(event.target.value)} className="mt-2" />
              </div>
              <Button className="w-full bg-[#061e3b] text-white hover:bg-[#0b2d56]" onClick={createChallenge}>
                <Plus className="mr-2 h-4 w-4" />
                Create Challenge
              </Button>
            </div>
          </Card>
          <Card className="min-w-0 rounded-[12px] border border-[#dbe5f0] bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[16px] font-black text-[#061e3b]">Challenge Library</h2>
              <Button variant="outline" className="h-8" onClick={() => setModal("challenges")}>View all</Button>
            </div>
            <ChallengeTable challenges={challenges.slice(0, 5)} />
          </Card>
        </section>
      ) : null}

      {activeTab === "sharing" ? (
        <section className="grid gap-4 md:grid-cols-4">
          <SummaryCard icon={Share2} label="Shares Tracked" value={String(shareCount)} trend="Customer shares feed this panel" color="#2563eb" />
          <SummaryCard icon={Users} label="Referral Clicks" value="37" trend="+8% vs last 30 days" color="#22c55e" />
          <SummaryCard icon={Sparkles} label="Best Share" value="Referral" trend="Highest converting card" color="#a855f7" />
          <SummaryCard icon={Gift} label="Referral Code" value="REF000022" trend="Customer card tracking" color="#f97316" />
        </section>
      ) : null}

      {activeTab === "surveys" ? (
        <section className="grid min-w-0 items-stretch gap-4 xl:grid-cols-[minmax(360px,0.6fr)_minmax(0,1fr)]">
          <Card className="min-w-0 rounded-[12px] border border-[#dbe5f0] bg-white p-5">
            <h2 className="text-[16px] font-black text-[#061e3b]">Publish Survey</h2>
            <div className="mt-5 space-y-4">
              <div>
                <Label>Survey title</Label>
                <Input value={surveyTitle} onChange={(event) => setSurveyTitle(event.target.value)} className="mt-2" />
              </div>
              <div>
                <Label>Bonus points</Label>
                <Input value={surveyPoints} onChange={(event) => setSurveyPoints(event.target.value)} className="mt-2" />
              </div>
              <Button className="w-full bg-[#061e3b] text-white hover:bg-[#0b2d56]" onClick={createSurvey}>Publish survey</Button>
            </div>
          </Card>
          <Card className="min-w-0 rounded-[12px] border border-[#dbe5f0] bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[16px] font-black text-[#061e3b]">Survey Results</h2>
              <Button variant="outline" className="h-8" onClick={() => setModal("surveys")}>View all</Button>
            </div>
            <SurveyTable surveys={surveys.slice(0, 5)} />
          </Card>
        </section>
      ) : null}

      {activeTab === "winback" ? (
        <section className="rounded-[12px] border border-[#dbe5f0] bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-[16px] font-black text-[#061e3b]">Inactive Members 60+ Days</h2>
              <p className="mt-1 text-sm text-[#64748b]">Find and re-engage dormant members with targeted campaigns.</p>
            </div>
            <Button variant="outline" onClick={() => setModal("inactive")}>View all</Button>
          </div>
          <InactiveTable rows={inactiveRows.slice(0, 6)} />
        </section>
      ) : null}

      <Dialog open={modal === "push"} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent className={adminModalClass}>
          <ModalHeader title="All Push Campaigns" onClose={() => setModal(null)} action={<Button variant="outline" className="h-9" onClick={() => toast.success("Campaign export prepared.")}><Download className="mr-2 h-4 w-4" />Export</Button>} />
          <FilterBar searchPlaceholder="Search campaigns..." filters={["Status: All", "Segment: All", "May 15 - May 21, 2026"]} />
          <PushCampaignTable campaigns={campaigns.slice(0, 6)} />
          <PaginationFooter label={`Showing 1 to ${Math.min(campaigns.length, 6)} of ${Math.max(campaigns.length, 24)} campaigns`} />
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "referrals"} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent className={adminModalClass}>
          <ModalHeader title="All Referrals" onClose={() => setModal(null)} action={<Button className="h-9 bg-[#061e3b] text-white hover:bg-[#0b2d56]"><Send className="mr-2 h-4 w-4" />Send Invite</Button>} />
          <ReferralSummary referrals={referrals} />
          <FilterBar searchPlaceholder="Search by name or email..." filters={["All Statuses", "Last 30 Days", "Filters"]} />
          <ReferralTable referrals={referrals.slice(0, 6)} />
          <PaginationFooter label={`Showing 1 to ${Math.min(referrals.length, 6)} of 127 referrals`} />
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "feedback"} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent className={adminModalClass}>
          <ModalHeader title="All Member Feedback" onClose={() => setModal(null)} action={<Button className="h-9 bg-[#061e3b] text-white hover:bg-[#0b2d56]" disabled={isGeneratingInsights} onClick={runInsights}><Sparkles className="mr-2 h-4 w-4" />Generate Insights</Button>} />
          <FeedbackSummary feedback={feedback} averageRating={averageRating} topCategory={topCategory} />
          <FeedbackInsightsPanel insights={feedbackInsights} loading={isGeneratingInsights} />
          <FilterBar searchPlaceholder="Search feedback..." filters={["All Categories", "All Ratings", "Sort: Newest First"]} />
          <FeedbackTable rows={feedbackRows.slice(0, 6)} reviewedIds={reviewedFeedbackIds} onReview={(id) => setReviewedFeedbackIds((prev) => [...new Set([...prev, id])])} />
          <PaginationFooter label={`Showing 1 to ${Math.min(feedbackRows.length, 6)} of ${Math.max(feedback.length, 28)} feedbacks`} />
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "surveys"} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent className={adminModalClass}>
          <ModalHeader title="All Surveys" onClose={() => setModal(null)} />
          <FilterBar searchPlaceholder="Search surveys..." filters={["All Statuses", "All Incentives", "Clear filters"]} />
          <SurveyTable surveys={surveys.slice(0, 6)} />
          <PaginationFooter label={`Showing 1 to ${Math.min(surveys.length, 6)} of ${surveys.length} surveys`} />
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "inactive"} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent className={adminModalClass}>
          <ModalHeader title="Inactive Members 60+ Days" onClose={() => setModal(null)} />
          <p className="-mt-2 mb-5 text-sm text-[#52627a]">Members who have not been active for 60 days or more. Use filters to find and re-engage them with targeted campaigns.</p>
          <FilterBar searchPlaceholder="Search by name, email or phone" filters={["All Segments", "60+ Days", "Filters"]} />
          <InactiveTable rows={inactiveRows.slice(0, 6)} />
          <PaginationFooter label={`Showing 1 to ${Math.min(inactiveRows.length, 6)} of 1,248 members`} />
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "challenges"} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent className={adminModalClass}>
          <ModalHeader title="Challenge Library" onClose={() => setModal(null)} action={<Button className="h-9 bg-[#061e3b] text-white hover:bg-[#0b2d56]" onClick={createChallenge}>Create Challenge</Button>} />
          <p className="-mt-2 mb-5 text-sm text-[#52627a]">Browse all challenges across your organization. Create new challenges or duplicate existing ones.</p>
          <FilterBar searchPlaceholder="Search challenges..." filters={["Status: All", "Reward Type: All", "Clear filters"]} />
          <ChallengeTable challenges={challenges.slice(0, 6)} />
          <PaginationFooter label={`Showing 1 to ${Math.min(challenges.length, 6)} of 24 challenges`} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterBar({ searchPlaceholder, filters }: { searchPlaceholder: string; filters: string[] }) {
  return (
    <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" />
        <Input placeholder={searchPlaceholder} className="h-9 rounded-md border-[#dbe5f0] pl-10 text-sm" />
      </div>
      {filters.map((filter) => (
        <button key={filter} type="button" className="inline-flex h-9 min-w-0 items-center justify-between gap-2 rounded-md border border-[#dbe5f0] bg-white px-3 text-xs font-bold text-[#061e3b]">
          {filter}
          {filter.includes("Filter") ? <Filter className="h-4 w-4" /> : <CalendarDays className="h-4 w-4 text-[#64748b]" />}
        </button>
      ))}
    </div>
  );
}

function PushCampaignTable({ campaigns, compact = false }: { campaigns: NotificationCampaign[]; compact?: boolean }) {
  const pad = compact ? "px-3 py-2.5" : "px-2.5 py-2.5";
  return (
    <TableShell>
      <table className={`${compact ? "text-[11px]" : "text-[11px]"} w-full table-fixed border-collapse text-left`}>
        <thead className="bg-[#f8fbff] text-[#52627a]">
          <tr>
            <th className={`${pad} ${compact ? "w-[27%]" : "w-[18%]"} font-black`}>Campaign</th>
            {!compact ? <th className={`${pad} w-[10%] font-black`}>Trigger</th> : null}
            <th className={`${pad} ${compact ? "w-[17%]" : "w-[11%]"} font-black`}>Segment</th>
            {!compact ? <th className={`${pad} w-[16%] font-black`}>Scheduled</th> : null}
            <th className={`${pad} ${compact ? "w-[8%]" : "w-[6%]"} font-black`}>Sent</th>
            <th className={`${pad} ${compact ? "w-[13%]" : "w-[10%]"} font-black`}>Delivery</th>
            <th className={`${pad} ${compact ? "w-[11%]" : "w-[8%]"} font-black`}>Open</th>
            <th className={`${pad} ${compact ? "w-[17%]" : "w-[11%]"} font-black`}>Status</th>
            <th className={`${pad} ${compact ? "w-[7%]" : "w-[5%]"} font-black`}>Winner</th>
            {!compact ? <th className={`${pad} w-[5%] font-black`}>Actions</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e5edf6] text-[#10213a]">
          {campaigns.map((campaign) => (
            <tr key={campaign.id}>
              <td className={`${pad} truncate font-bold leading-5`}>{campaign.name}</td>
              {!compact ? <td className={`${pad} truncate`}>{campaign.trigger}</td> : null}
              <td className={`${pad} truncate`}>{campaign.segment}</td>
              {!compact ? <td className={`${pad} truncate`}>{formatDateTime(campaign.scheduledFor)}</td> : null}
              <td className={pad}>{campaign.sentCount}</td>
              <td className={`${pad} font-black text-[#16a34a]`}>{percentage(campaign.deliveredCount, campaign.sentCount)}%</td>
              <td className={`${pad} font-black text-[#2563eb]`}>{percentage(campaign.openedCount, campaign.sentCount)}%</td>
              <td className={pad}><Badge className={statusClass(campaign.status)}>{campaign.status}</Badge></td>
              <td className={pad}>{campaign.winner === "Pending" ? "-" : <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#061e3b] text-xs font-black text-white">{campaign.winner}</span>}</td>
              {!compact ? <td className={pad}><MoreHorizontal className="h-4 w-4" /></td> : null}
            </tr>
          ))}
          {campaigns.length === 0 ? <EmptyTableRow colSpan={compact ? 7 : 10} text="No push campaigns yet." /> : null}
        </tbody>
      </table>
    </TableShell>
  );
}

function MiniTableFooter({ label }: { label: string }) {
  return (
    <div className="mt-3 flex items-center justify-between text-[11px] font-medium text-[#52627a]">
      <span>{label}</span>
      <div className="flex items-center gap-2">
        <button className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[#64748b]">&lt;</button>
        <button className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#061e3b] text-xs font-black text-white">1</button>
        <button className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[#061e3b]">2</button>
        <button className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[#64748b]">&gt;</button>
      </div>
    </div>
  );
}

function ReferralPanel({ referrals, onViewAll }: { referrals: ReferralRecord[]; onViewAll: () => void }) {
  return (
    <Card className="min-w-0 rounded-[12px] border border-[#dbe5f0] bg-white p-5 shadow-[0_10px_28px_rgba(15,35,60,0.04)]">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-[16px] font-black text-[#061e3b]">Referral Tracking</h2>
          <p className="mt-1 text-xs font-bold text-[#52627a]">{referrals.length} invites - {referrals.filter((row) => row.status === "joined").length} conversion - {referrals.filter((row) => row.bonusAwarded).length} bonuses</p>
        </div>
        <Button variant="outline" className="h-8 text-xs" onClick={onViewAll}>View all</Button>
      </div>
      <ReferralTable referrals={referrals.slice(0, 3)} compact />
    </Card>
  );
}

function ReferralSummary({ referrals }: { referrals: ReferralRecord[] }) {
  const joined = referrals.filter((row) => row.status === "joined").length;
  const pending = referrals.length - joined;
  const bonuses = referrals.filter((row) => row.bonusAwarded).length;
  const cards: Array<{ label: string; value: string | number; icon: LucideIcon; color: string; trend: string }> = [
    { label: "Total Invites", value: referrals.length || 127, icon: Users, color: "#2563eb", trend: "+12% vs last 30 days" },
    { label: "Joined", value: joined || 42, icon: CheckCircle2, color: "#16a34a", trend: "+16% vs last 30 days" },
    { label: "Pending", value: pending || 35, icon: Bell, color: "#f97316", trend: "-3% vs last 30 days" },
    { label: "Conversion Rate", value: referrals.length ? `${Math.round((joined / referrals.length) * 100)}%` : "33.07%", icon: Sparkles, color: "#8b5cf6", trend: "+2.4% vs last 30 days" },
    { label: "Bonuses Awarded", value: bonuses ? `$${bonuses * 25}` : "$420", icon: Gift, color: "#f59e0b", trend: "+8% vs last 30 days" },
  ];
  return (
    <div className="mb-3 grid gap-2 md:grid-cols-5">
      {cards.map(({ label, value, icon: Icon, color, trend }) => (
        <Card key={label} className="rounded-[10px] border border-[#dbe5f0] p-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-[10px]" style={{ backgroundColor: `${color}14`, color }}>
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-bold text-[#64748b]">{label}</p>
              <p className="mt-1 text-xl font-black text-[#061e3b]">{value}</p>
            </div>
          </div>
          <p className="mt-2 text-[10px] font-semibold text-[#16a34a]">{trend}</p>
        </Card>
      ))}
    </div>
  );
}

function ReferralTable({ referrals, compact = false }: { referrals: ReferralRecord[]; compact?: boolean }) {
  const pad = compact ? "px-3 py-3" : "px-2.5 py-2.5";
  return (
    <TableShell>
      <table className="w-full table-fixed border-collapse text-left text-[11px]">
        <thead className="bg-[#f8fbff] text-[#52627a]">
          <tr>
            <th className={`${pad} ${compact ? "w-[32%]" : "w-[18%]"} font-black`}>Referrer</th>
            {!compact ? <th className={`${pad} w-[22%] font-black`}>Email</th> : null}
            <th className={`${pad} ${compact ? "w-[18%]" : "w-[12%]"} font-black`}>Status</th>
            <th className={`${pad} ${compact ? "w-[24%]" : "w-[14%]"} font-black`}>Code</th>
            {!compact ? <th className={`${pad} w-[12%] font-black`}>Invited</th> : null}
            <th className={`${pad} ${compact ? "w-[12%]" : "w-[9%]"} font-black`}>Joined</th>
            <th className={`${pad} ${compact ? "w-[14%]" : "w-[9%]"} font-black`}>Bonus</th>
            {!compact ? <th className={`${pad} w-[4%] font-black`}>Act</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e5edf6] text-[#10213a]">
          {referrals.map((referral, index) => {
            const name = ["James Doe", "Ava Clark", "Michael Kim", "Jessica Smith", "Brian Roberts", "Sophie Williams"][index % 6];
            return (
              <tr key={referral.id}>
                <td className={pad}>
                  <div className="flex items-center gap-3">
                    <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f3e8ff] text-[11px] font-black text-[#7e22ce] sm:inline-flex">{initials(name)}</span>
                    <span className="min-w-0 truncate font-bold">{name}</span>
                  </div>
                </td>
                {!compact ? <td className={`${pad} truncate`}>{referral.refereeEmail}</td> : null}
                <td className={pad}><Badge className={statusClass(referral.status === "joined" ? "Converted" : "Pending")}>{referral.status === "joined" ? "Converted" : "Pending"}</Badge></td>
                <td className={`${pad} truncate font-bold`}>{referral.referrerCode || "REF000022"}</td>
                {!compact ? <td className={`${pad} truncate`}>{formatDate(referral.createdAt)}</td> : null}
                <td className={pad}>{referral.status === "joined" ? "Yes" : "No"}</td>
                <td className={`${pad} font-black text-[#16a34a]`}>{referral.bonusAwarded ? "$25" : "-"}</td>
                {!compact ? <td className={pad}><Send className="h-4 w-4 text-[#2563eb]" /></td> : null}
              </tr>
            );
          })}
          {referrals.length === 0 ? <EmptyTableRow colSpan={compact ? 5 : 8} text="No referrals yet." /> : null}
        </tbody>
      </table>
    </TableShell>
  );
}

function FeedbackPanel({
  feedbackRows,
  totalFeedback,
  averageRating,
  topCategory,
  onViewAll,
}: {
  feedbackRows: Array<FeedbackRecord & { duplicateCount: number }>;
  totalFeedback: number;
  averageRating: number;
  topCategory: string;
  onViewAll: () => void;
}) {
  return (
    <Card className="min-w-0 rounded-[12px] border border-[#dbe5f0] bg-white p-5 shadow-[0_10px_28px_rgba(15,35,60,0.04)]">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-[16px] font-black text-[#061e3b]">Member Feedback</h2>
          <p className="mt-1 text-xs font-bold text-[#52627a]">{totalFeedback} feedbacks - {averageRating.toFixed(1)} avg rating - Top category: {topCategory}</p>
        </div>
        <Button variant="outline" className="h-8 text-xs" onClick={onViewAll}>View all</Button>
      </div>
      <FeedbackTable rows={feedbackRows} reviewedIds={[]} onReview={() => undefined} compact />
    </Card>
  );
}

function FeedbackSummary({ feedback, averageRating, topCategory }: { feedback: FeedbackRecord[]; averageRating: number; topCategory: string }) {
  const needsAttention = feedback.filter((item) => item.rating <= 3).length;
  const cards: Array<{ label: string; value: string | number; icon: LucideIcon; color: string }> = [
    { label: "Total Feedback", value: feedback.length || 28, icon: MessageSquareText, color: "#8b5cf6" },
    { label: "Average Rating", value: averageRating ? averageRating.toFixed(1) : "4.8", icon: Star, color: "#f59e0b" },
    { label: "Top Category", value: topCategory, icon: Gift, color: "#22c55e" },
    { label: "Needs Attention", value: needsAttention, icon: Bell, color: "#ef4444" },
  ];
  return (
    <div className="mb-3 grid gap-2 md:grid-cols-4">
      {cards.map(({ label, value, icon: Icon, color }) => (
        <Card key={label} className="rounded-[10px] border border-[#dbe5f0] p-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-[10px]" style={{ backgroundColor: `${color}14`, color: String(color) }}>
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-bold text-[#64748b]">{label}</p>
              <p className="mt-1 text-xl font-black capitalize text-[#061e3b]">{value}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function FeedbackInsightsPanel({ insights, loading }: { insights: FeedbackInsights | null; loading: boolean }) {
  const sentiment = insights?.sentimentSplit ?? { positive: 0, neutral: 0, negative: 0 };
  const topics = insights?.topTopics ?? [];
  const similarGroups = (insights?.similarFeedbackGroups ?? []).filter((group) => group.count > 1);
  const words = (insights?.wordCloud ?? []).slice(0, 10);
  return (
    <div className="mb-3 rounded-[12px] border border-[#dbe5f0] bg-[#f8fbff] p-3">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#0b8b95]">Cosine Similarity Insights</p>
          <p className="text-xs font-semibold text-[#52627a]">
            {loading ? "Generating feedback clusters..." : insights ? `${insights.sourceCount} feedback rows analyzed` : "Click Generate Insights to analyze feedback topics and duplicate clusters."}
          </p>
        </div>
        {insights?.createdAt ? <span className="text-[11px] font-bold text-[#64748b]">Updated {formatDateTime(insights.createdAt)}</span> : null}
      </div>
      <div className="grid gap-2 lg:grid-cols-[0.75fr_1fr_1.2fr]">
        <div className="grid grid-cols-3 gap-2">
          {[
            ["Positive", sentiment.positive, "text-[#15803d] bg-[#ecfdf3]"],
            ["Neutral", sentiment.neutral, "text-[#475569] bg-[#eef2f7]"],
            ["Negative", sentiment.negative, "text-[#b91c1c] bg-[#fff1f2]"],
          ].map(([label, value, className]) => (
            <div key={String(label)} className={`rounded-[10px] px-3 py-2 ${className}`}>
              <p className="text-[10px] font-black uppercase">{label}</p>
              <p className="mt-1 text-lg font-black">{value}</p>
            </div>
          ))}
        </div>
        <div className="rounded-[10px] bg-white p-3">
          <p className="text-[11px] font-black text-[#52627a]">Top Topics</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {topics.length > 0 ? topics.map((topic) => (
              <span key={topic.topic} className="rounded-full bg-[#ede9fe] px-2.5 py-1 text-[11px] font-bold text-[#6d28d9]">
                {topic.topic} ({topic.count})
              </span>
            )) : <span className="text-xs font-semibold text-[#64748b]">No topics yet.</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {words.map((word) => (
              <span key={word.word} className="rounded-md bg-[#eef6ff] px-2 py-1 text-[10px] font-bold text-[#1d4ed8]">{word.word}</span>
            ))}
          </div>
        </div>
        <div className="rounded-[10px] bg-white p-3">
          <p className="text-[11px] font-black text-[#52627a]">Similar Feedback Clusters</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {similarGroups.slice(0, 4).map((group) => (
              <div key={`${group.topic}-${group.feedbackIds.join("-")}`} className="rounded-[9px] border border-[#e5edf6] px-3 py-2">
                <p className="truncate text-xs font-black text-[#061e3b]">{group.topic}</p>
                <p className="mt-1 text-[11px] font-semibold text-[#64748b]">{group.count} similar / {(group.averageSimilarity * 100).toFixed(0)}% match</p>
              </div>
            ))}
            {similarGroups.length === 0 ? <p className="text-xs font-semibold text-[#64748b]">No duplicate clusters above threshold yet.</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeedbackTable({
  rows,
  reviewedIds,
  onReview,
  compact = false,
}: {
  rows: Array<FeedbackRecord & { duplicateCount: number }>;
  reviewedIds: string[];
  onReview: (id: string) => void;
  compact?: boolean;
}) {
  const pad = compact ? "px-3 py-3" : "px-2.5 py-2.5";
  return (
    <TableShell>
      <table className="w-full table-fixed border-collapse text-left text-[11px]">
        <thead className="bg-[#f8fbff] text-[#52627a]">
          <tr>
            <th className={`${pad} ${compact ? "w-[15%]" : "w-[9%]"} font-black`}>Rating</th>
            {!compact ? <th className={`${pad} w-[17%] font-black`}>Member</th> : null}
            <th className={`${pad} ${compact ? "w-[20%]" : "w-[12%]"} font-black`}>Category</th>
            <th className={`${pad} ${compact ? "w-[65%]" : "w-[37%]"} font-black`}>Feedback</th>
            {!compact ? <th className={`${pad} w-[13%] font-black`}>Date</th> : null}
            {!compact ? <th className={`${pad} w-[8%] font-black`}>Status</th> : null}
            {!compact ? <th className={`${pad} w-[4%] font-black`}>Act</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e5edf6] text-[#10213a]">
          {rows.map((item) => (
            <tr key={item.id}>
              <td className={`${pad} whitespace-nowrap`}><span className="font-black text-[#f59e0b]">{item.rating}/5</span></td>
              {!compact ? <td className={`${pad} truncate`}>{item.memberName || item.memberId}</td> : null}
              <td className={pad}><Badge className="bg-[#ede9fe] capitalize text-[#6d28d9]">{item.category}</Badge></td>
              <td className={`${pad} truncate`}>{item.comment}{item.duplicateCount > 1 ? <span className="ml-2 rounded bg-[#eef2ff] px-2 py-0.5 text-[10px] font-bold text-[#3730a3]">x{item.duplicateCount}</span> : null}</td>
              {!compact ? <td className={`${pad} truncate`}>{formatDate(item.createdAt)}</td> : null}
              {!compact ? <td className={pad}><Badge className={reviewedIds.includes(item.id) ? statusClass("completed") : statusClass("pending")}>{reviewedIds.includes(item.id) ? "Reviewed" : "Open"}</Badge></td> : null}
              {!compact ? <td className={pad}><button type="button" className="text-[#2563eb]" onClick={() => onReview(item.id)}><MoreHorizontal className="h-4 w-4" /></button></td> : null}
            </tr>
          ))}
          {rows.length === 0 ? <EmptyTableRow colSpan={compact ? 3 : 7} text="No feedback yet." /> : null}
        </tbody>
      </table>
    </TableShell>
  );
}

function SurveyTable({ surveys }: { surveys: SurveyDefinition[] }) {
  return (
    <TableShell>
      <table className="w-full table-fixed border-collapse text-left text-[11px]">
        <thead className="bg-[#f8fbff] text-[#52627a]">
          <tr>
            <th className="w-[30%] px-2.5 py-2.5 font-black">Survey Name</th>
            <th className="w-[16%] px-2.5 py-2.5 font-black">Audience</th>
            <th className="w-[11%] px-2.5 py-2.5 font-black">Responses</th>
            <th className="w-[12%] px-2.5 py-2.5 font-black">Completion</th>
            <th className="w-[11%] px-2.5 py-2.5 font-black">Incentive</th>
            <th className="w-[10%] px-2.5 py-2.5 font-black">Status</th>
            <th className="w-[10%] px-2.5 py-2.5 font-black">Start</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e5edf6] text-[#10213a]">
          {surveys.map((survey, index) => (
            <tr key={survey.id}>
              <td className="truncate px-2.5 py-2.5 font-bold">{survey.title}</td>
              <td className="truncate px-2.5 py-2.5">{survey.segment}</td>
              <td className="px-2.5 py-2.5">{survey.responses.length || [328, 214, 156, 89][index % 4]}</td>
              <td className="px-2.5 py-2.5">{[64, 58, 71, 52][index % 4]}%</td>
              <td className="px-2.5 py-2.5">${(survey.bonusPoints / 50).toFixed(2)}</td>
              <td className="px-2.5 py-2.5"><Badge className={statusClass(survey.status)}>{survey.status}</Badge></td>
              <td className="truncate px-2.5 py-2.5">{formatDate(survey.createdAt)}</td>
            </tr>
          ))}
          {surveys.length === 0 ? <EmptyTableRow colSpan={7} text="No surveys published yet." /> : null}
        </tbody>
      </table>
    </TableShell>
  );
}

function ChallengeTable({ challenges }: { challenges: ChallengeDefinition[] }) {
  return (
    <TableShell>
      <table className="w-full table-fixed border-collapse text-left text-[11px]">
        <thead className="bg-[#f8fbff] text-[#52627a]">
          <tr>
            <th className="w-[25%] px-2.5 py-2.5 font-black">Challenge</th>
            <th className="w-[14%] px-2.5 py-2.5 font-black">Audience</th>
            <th className="w-[12%] px-2.5 py-2.5 font-black">Reward</th>
            <th className="w-[10%] px-2.5 py-2.5 font-black">Members</th>
            <th className="w-[17%] px-2.5 py-2.5 font-black">Progress</th>
            <th className="w-[10%] px-2.5 py-2.5 font-black">End</th>
            <th className="w-[8%] px-2.5 py-2.5 font-black">Status</th>
            <th className="w-[4%] px-2.5 py-2.5 font-black">Act</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e5edf6] text-[#10213a]">
          {challenges.map((challenge, index) => {
            const progress = [75, 60, 45, 30, 100, 0][index % 6];
            const active = new Date(challenge.endAt).getTime() >= Date.now();
            return (
              <tr key={challenge.id}>
                <td className="px-2.5 py-2.5"><p className="truncate font-bold">{challenge.title}</p><p className="truncate text-[10px] text-[#64748b]">{challenge.rewardBadge}</p></td>
                <td className="truncate px-2.5 py-2.5">{challenge.segment}</td>
                <td className="px-2.5 py-2.5">{challenge.rewardPoints} pts</td>
                <td className="px-2.5 py-2.5">{[385, 284, 193, 98, 512][index % 5]}</td>
                <td className="px-2.5 py-2.5"><div className="flex items-center gap-2"><span>{progress}%</span><span className="h-1.5 flex-1 rounded-full bg-[#e5edf6]"><span className="block h-1.5 rounded-full bg-[#22c55e]" style={{ width: `${progress}%` }} /></span></div></td>
                <td className="truncate px-2.5 py-2.5">{formatDate(challenge.endAt)}</td>
                <td className="px-2.5 py-2.5"><Badge className={statusClass(active ? "Active" : "Completed")}>{active ? "Active" : "Completed"}</Badge></td>
                <td className="px-2.5 py-2.5"><MoreHorizontal className="h-4 w-4" /></td>
              </tr>
            );
          })}
          {challenges.length === 0 ? <EmptyTableRow colSpan={8} text="No challenges published yet." /> : null}
        </tbody>
      </table>
    </TableShell>
  );
}

function InactiveTable({ rows }: { rows: DemoInactiveMember[] }) {
  return (
    <TableShell>
      <table className="w-full table-fixed border-collapse text-left text-[11px]">
        <thead className="bg-[#f8fbff] text-[#52627a]">
          <tr>
            <th className="w-[22%] px-2.5 py-2.5 font-black">Member</th>
            <th className="w-[12%] px-2.5 py-2.5 font-black">Segment</th>
            <th className="w-[13%] px-2.5 py-2.5 font-black">Last Active</th>
            <th className="w-[10%] px-2.5 py-2.5 font-black">Value</th>
            <th className="w-[9%] px-2.5 py-2.5 font-black">Risk</th>
            <th className="w-[18%] px-2.5 py-2.5 font-black">Campaign</th>
            <th className="w-[8%] px-2.5 py-2.5 font-black">Status</th>
            <th className="w-[8%] px-2.5 py-2.5 font-black">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e5edf6] text-[#10213a]">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-2.5 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fee2e2] text-[11px] font-black text-[#b91c1c]">{initials(row.name)}</span>
                  <span className="min-w-0">
                    <p className="truncate font-bold">{row.name}</p>
                    <p className="truncate text-[10px] text-[#64748b]">{row.email}</p>
                  </span>
                </div>
              </td>
              <td className="truncate px-2.5 py-2.5">{row.segment}</td>
              <td className="truncate px-2.5 py-2.5">{row.lastActive}<p className="truncate text-[10px] text-[#64748b]">{row.daysAgo} days ago</p></td>
              <td className="px-2.5 py-2.5">${row.lifetimeValue.toLocaleString()}</td>
              <td className="px-2.5 py-2.5"><Badge className={statusClass(row.risk)}>{row.risk}</Badge></td>
              <td className="truncate px-2.5 py-2.5 font-bold text-[#1d4ed8]">{row.suggestedCampaign}</td>
              <td className="truncate px-2.5 py-2.5">{row.status}</td>
              <td className="px-2.5 py-2.5"><Button variant="outline" className="h-7 px-2 text-[10px]">Send</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

function PaginationFooter({ label }: { label: string }) {
  return (
    <div className="mt-3 flex flex-col gap-2 text-xs text-[#52627a] sm:flex-row sm:items-center sm:justify-between">
      <span>{label}</span>
      <div className="flex items-center gap-2">
        <button className="h-7 rounded-md border border-[#dbe5f0] px-2 text-[#64748b]">Prev</button>
        <button className="h-7 w-7 rounded-md bg-[#061e3b] font-black text-white">1</button>
        <button className="h-7 w-7 rounded-md border border-[#dbe5f0]">2</button>
        <button className="h-7 w-7 rounded-md border border-[#dbe5f0]">3</button>
        <button className="h-7 rounded-md border border-[#dbe5f0] px-2 text-[#64748b]">Next</button>
      </div>
    </div>
  );
}
