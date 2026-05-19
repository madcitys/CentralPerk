import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import QRCode from "qrcode";
import {
  ArrowRight,
  Award,
  BadgeCheck,
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Gift,
  HeartPulse,
  Lock,
  MessageSquareText,
  Pill,
  QrCode,
  Send,
  Share2,
  ShieldPlus,
  Sparkles,
  Star,
  Target,
  Trophy,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Progress } from "../../../components/ui/progress";
import { Textarea } from "../../../components/ui/textarea";
import type { AppOutletContext } from "../../types/app-context";
import { awardPointsViaApi } from "../../lib/api";
import {
  getChallengeProgress,
  loadChallengeDefinitions,
  loadMemberPrivacySettings,
  loadSocialShareEvents,
  loadSurveyDefinitions,
  recordSocialShareEvent,
  saveMemberPrivacySettings,
  submitSurveyResponseRecord,
  type ChallengeDefinition,
  type ShareEvent,
  type SharePrivacySettings,
  type SurveyDefinition,
} from "../../lib/member-engagement";
import {
  claimBirthdayReward,
  createReferral,
  getBirthdayRewardPoints,
  getMemberReferralCode,
  hasBirthdayClaimedThisYear,
  isBirthdayMonth,
  loadBirthdayRewardSettingsFromApi,
  loadBirthdayRewardStatus,
  loadReferrals,
  queueManagerFeedbackNotification,
  shouldAutoCreditBirthdayReward,
  submitFeedback,
  type BirthdayRewardSettings,
  type ReferralRecord,
} from "../../lib/member-lifecycle";

type EngagementTab = "overview" | "rewards" | "challenges" | "sharing" | "surveys";

type BirthdayStatus = {
  hasReward: boolean;
  voucherCode: string | null;
  pointsAwarded: number;
  badgeLabel: string | null;
};

const engagementTabs: { value: EngagementTab; label: string; hash: string }[] = [
  { value: "overview", label: "Overview", hash: "#engagement-overview" },
  { value: "rewards", label: "Referral & Feedback", hash: "#engagement-rewards" },
  { value: "challenges", label: "Challenges", hash: "#engagement-challenges" },
  { value: "sharing", label: "Sharing", hash: "#engagement-sharing" },
  { value: "surveys", label: "Surveys", hash: "#engagement-surveys" },
];

const defaultBirthdaySettings: BirthdayRewardSettings = {
  amounts: { Bronze: 100, Silver: 500, Gold: 1000 },
  releaseTiming: "first_day_of_birthday_month",
  fulfillmentMode: "auto_credit",
  claimWindow: "birthday_month_only",
};

const defaultPrivacySettings: SharePrivacySettings = {
  showName: true,
  showReferralCode: true,
  publicProfile: true,
};

function resolveInitialEngagementTab(): EngagementTab {
  if (typeof window === "undefined") return "overview";
  const hash = window.location.hash;
  return engagementTabs.find((tab) => tab.hash === hash)?.value ?? "overview";
}

function numberFormat(value: number) {
  return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString();
}

function dateLabel(value?: string | null) {
  if (!value) return "Ongoing";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Ongoing";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function isLiveChallenge(challenge: ChallengeDefinition) {
  const now = Date.now();
  const start = new Date(challenge.startAt).getTime();
  const end = new Date(challenge.endAt).getTime();
  return (Number.isNaN(start) || start <= now) && (Number.isNaN(end) || end >= now);
}

function challengeIcon(challenge: ChallengeDefinition): LucideIcon {
  if (challenge.type === "survey-completion") return ClipboardCheck;
  if (challenge.type === "points-earned") return Trophy;
  return HeartPulse;
}

function statusPillClass(status: "available" | "complete" | "locked" | "active") {
  if (status === "complete") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "locked") return "bg-slate-100 text-slate-600 border-slate-200";
  if (status === "active") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-teal-50 text-teal-700 border-teal-200";
}

function EngagementHeroArt() {
  return (
    <div className="relative hidden min-h-[120px] overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#e9f8ff,#f8fcff)] p-5 lg:block">
      <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-cyan-100/70" />
      <div className="absolute bottom-4 right-10 h-16 w-28 rounded-2xl bg-[#03a6b0] shadow-lg" />
      <div className="absolute bottom-14 right-[68px] h-8 w-20 rounded-xl bg-[#0d3d64]" />
      <div className="absolute bottom-9 right-[72px] h-14 w-4 rounded-full bg-cyan-300" />
      <Gift className="absolute bottom-7 right-[92px] h-10 w-10 text-white" />
      <ShieldPlus className="absolute bottom-8 right-[156px] h-12 w-12 rounded-2xl bg-white p-2 text-[#03a6b0] shadow" />
      <Sparkles className="absolute right-8 top-8 h-5 w-5 text-sky-400" />
    </div>
  );
}

function SectionCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <Card className={`border-[#dce7f3] bg-white shadow-[0_10px_24px_rgba(15,35,60,0.05)] ${className}`}>
      {children}
    </Card>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  accent = "teal",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  accent?: "teal" | "blue" | "purple" | "green";
}) {
  const accentClass =
    accent === "purple"
      ? "bg-violet-50 text-violet-700"
      : accent === "blue"
        ? "bg-blue-50 text-blue-700"
        : accent === "green"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-cyan-50 text-[#008d97]";

  return (
    <SectionCard className="p-5">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accentClass}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">{label}</p>
          <p className="mt-1 text-2xl font-bold text-[#10213a]">{value}</p>
          <p className="text-xs text-[#667085]">{detail}</p>
        </div>
      </div>
    </SectionCard>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#c8d8eb] bg-[#f8fbff] p-6 text-center">
      <Icon className="mx-auto h-9 w-9 text-[#008d97]" />
      <p className="mt-3 text-sm font-semibold text-[#10213a]">{title}</p>
      <p className="mt-1 text-sm text-[#667085]">{body}</p>
      {actionLabel && onAction ? (
        <Button className="mt-4 bg-[#008d97] text-white hover:bg-[#007982]" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export default function CustomerEngagementPage() {
  const { user, refreshUser, setUser } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<EngagementTab>(resolveInitialEngagementTab);
  const [challenges, setChallenges] = useState<ChallengeDefinition[]>([]);
  const [surveys, setSurveys] = useState<SurveyDefinition[]>([]);
  const [shareEvents, setShareEvents] = useState<ShareEvent[]>([]);
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [referralCode, setReferralCode] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [birthdaySettings, setBirthdaySettings] = useState<BirthdayRewardSettings>(defaultBirthdaySettings);
  const [birthdayStatus, setBirthdayStatus] = useState<BirthdayStatus>({
    hasReward: false,
    voucherCode: null,
    pointsAwarded: 0,
    badgeLabel: null,
  });
  const [privacySettings, setPrivacySettings] = useState<SharePrivacySettings>(defaultPrivacySettings);
  const [showTier, setShowTier] = useState(true);
  const [selectedAchievement, setSelectedAchievement] = useState("Shared a wellness rewards update");
  const [shareCaption, setShareCaption] = useState("");
  const [referralEmail, setReferralEmail] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState<"points" | "rewards" | "service" | "app">("service");
  const [feedbackRating, setFeedbackRating] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackContactOptIn, setFeedbackContactOptIn] = useState(false);
  const [feedbackContactInfo, setFeedbackContactInfo] = useState("");
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, Record<string, string>>>({});
  const [completedSurveyIds, setCompletedSurveyIds] = useState<string[]>([]);
  const [submittingSurveyId, setSubmittingSurveyId] = useState<string | null>(null);
  const [loadingError, setLoadingError] = useState(false);

  useEffect(() => {
    const current = engagementTabs.find((tab) => tab.value === activeTab);
    if (!current || typeof window === "undefined") return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${current.hash}`);
  }, [activeTab]);

  const loadEngagementData = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoadingError(false);

    const [challengeRows, surveyRows, shares, referralRows, code, settings, status, privacy] = await Promise.all([
      loadChallengeDefinitions(),
      loadSurveyDefinitions(),
      loadSocialShareEvents({ memberIdentifier: user.memberId }),
      loadReferrals(user.memberId),
      getMemberReferralCode(user.memberId, user.email),
      loadBirthdayRewardSettingsFromApi(),
      loadBirthdayRewardStatus(user.memberId, user.email),
      loadMemberPrivacySettings(user.memberId),
    ]);

    setChallenges(challengeRows);
    setSurveys(surveyRows);
    setShareEvents(shares);
    setReferrals(referralRows);
    setReferralCode(code);
    setBirthdaySettings(settings);
    setBirthdayStatus(status);
    setPrivacySettings(privacy);
  }, [user.email, user.memberId]);

  useEffect(() => {
    let alive = true;

    loadEngagementData()
      .catch((error) => {
        console.error("Customer engagement data failed to load", error);
        if (alive) setLoadingError(true);
      });

    return () => {
      alive = false;
    };
  }, [loadEngagementData]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadEngagementData({ silent: true }).catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [loadEngagementData]);

  const referralLink = useMemo(() => {
    if (!referralCode || typeof window === "undefined") return "";
    return `${window.location.origin}/register?ref=${encodeURIComponent(referralCode)}`;
  }, [referralCode]);

  useEffect(() => {
    if (!referralLink) {
      setQrDataUrl("");
      return;
    }
    let alive = true;
    QRCode.toDataURL(referralLink, { margin: 1, width: 176 })
      .then((url) => {
        if (alive) setQrDataUrl(url);
      })
      .catch(() => {
        if (alive) setQrDataUrl("");
      });
    return () => {
      alive = false;
    };
  }, [referralLink]);

  const liveChallenges = useMemo(() => challenges.filter(isLiveChallenge), [challenges]);
  const activeSurveys = useMemo(() => surveys.filter((survey) => survey.status === "live"), [surveys]);
  const completedSurveyRecords = useMemo(() => {
    return surveys.flatMap((survey) =>
      survey.responses
        .filter((response) => response.memberId === user.memberId || response.memberName === user.fullName)
        .map((response) => ({ survey, response })),
    );
  }, [surveys, user.fullName, user.memberId]);
  const completedSurveyIdSet = useMemo(() => {
    const set = new Set(completedSurveyIds);
    completedSurveyRecords.forEach((row) => set.add(row.survey.id));
    return set;
  }, [completedSurveyIds, completedSurveyRecords]);
  const referralJoins = referrals.filter((referral) => referral.status === "joined").length;
  const completedChallenges = liveChallenges.filter((challenge) => getChallengeProgress(challenge, user).completed);
  const availableChallengePoints = liveChallenges
    .filter((challenge) => !getChallengeProgress(challenge, user).completed)
    .reduce((sum, challenge) => sum + Math.max(0, Number(challenge.rewardPoints || 0)), 0);
  const endingSoon = liveChallenges.filter((challenge) => {
    const end = new Date(challenge.endAt).getTime();
    return Number.isFinite(end) && end - Date.now() <= 7 * 24 * 60 * 60 * 1000;
  }).length;
  const surveyPointsEarned = completedSurveyRecords.reduce((sum, row) => sum + Math.max(0, Number(row.survey.bonusPoints || 0)), 0);
  const birthdayPoints = birthdayStatus.pointsAwarded || getBirthdayRewardPoints(user.tier);

  const nextBestAction = useMemo(() => {
    const openSurvey = activeSurveys.find((survey) => !completedSurveyIdSet.has(survey.id));
    if (openSurvey) {
      return {
        title: "Answer today's survey",
        body: `${openSurvey.bonusPoints} bonus points are available after submission.`,
        actionLabel: "Start Survey",
        action: () => {
          setActiveTab("surveys");
          setSelectedSurveyId(openSurvey.id);
        },
      };
    }

    if (!referralCode || referrals.length === 0) {
      return {
        title: "Invite a friend",
        body: "Create a referral invite and track joins from your member hub.",
        actionLabel: "Send Invite",
        action: () => setActiveTab("rewards"),
      };
    }

    const openChallenge = liveChallenges.find((challenge) => !getChallengeProgress(challenge, user).completed);
    if (openChallenge) {
      return {
        title: "Continue challenge",
        body: `${openChallenge.rewardPoints} points available in ${openChallenge.title}.`,
        actionLabel: "View Challenges",
        action: () => setActiveTab("challenges"),
      };
    }

    return {
      title: birthdayStatus.hasReward ? "Birthday perk recorded" : "Check birthday perk",
      body: birthdayStatus.hasReward
        ? `${birthdayPoints} birthday points are recorded for this year.`
        : "Your yearly birthday benefit status is available here.",
      actionLabel: "Check Status",
      action: () => setActiveTab("rewards"),
    };
  }, [activeSurveys, birthdayPoints, birthdayStatus.hasReward, completedSurveyIdSet, liveChallenges, referralCode, referrals.length, user]);

  const selectedSurvey = selectedSurveyId ? surveys.find((survey) => survey.id === selectedSurveyId) ?? null : null;
  const shareMessage =
    shareCaption.trim() ||
    `${privacySettings.showName ? user.fullName : "A PharmaRewards member"} is earning pharmacy rewards. Use referral code ${privacySettings.showReferralCode ? referralCode || "pending" : "hidden"}.`;

  const copyText = async (value: string, success: string) => {
    if (!value) {
      toast.error("Nothing to copy yet.");
      return;
    }
    await navigator.clipboard.writeText(value);
    toast.success(success);
  };

  const copyShareCardText = async () => {
    const lines = [
      "PharmaRewards Pharmacy Rewards",
      privacySettings.showName ? `Member: ${user.fullName}` : "Member: Rewards member",
      showTier ? `Tier: ${user.tier}` : "",
      `Achievement: ${selectedAchievement}`,
      `Points: ${numberFormat(user.points)}`,
      privacySettings.showReferralCode ? `Referral code: ${referralCode || "Pending"}` : "",
      shareMessage,
      referralLink,
    ].filter(Boolean);

    await copyText(lines.join("\n"), "Share card text copied.");
  };

  const updatePrivacy = async (patch: Partial<SharePrivacySettings>) => {
    const next = { ...privacySettings, ...patch };
    setPrivacySettings(next);
    try {
      await saveMemberPrivacySettings(user.memberId, next);
    } catch {
      toast.error("Sharing settings could not be saved.");
    }
  };

  const refreshReferralRows = async () => {
    const rows = await loadReferrals(user.memberId);
    setReferrals(rows);
  };

  const handleCreateReferral = async () => {
    const email = referralEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Friend email is required.");
      return;
    }

    try {
      await createReferral({ referrerMemberId: user.memberId, refereeEmail: email });
      await refreshReferralRows();
      await loadEngagementData({ silent: true }).catch(() => undefined);
      setReferralEmail("");
      toast.success("Referral created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Referral could not be created.");
    }
  };

  const handleFeedbackSubmit = async () => {
    const comment = feedbackComment.trim();
    if (!comment) {
      toast.error("Feedback comment is required.");
      return;
    }
    if (comment.length > 500) {
      toast.error("Feedback comment must be 500 characters or less.");
      return;
    }

    try {
      const saved = await submitFeedback({
        memberId: user.memberId,
        memberName: user.fullName,
        category: feedbackCategory,
        rating: feedbackRating,
        comment,
        contactOptIn: feedbackContactOptIn,
        contactInfo: feedbackContactInfo.trim() || null,
      });
      await queueManagerFeedbackNotification(saved);
      setFeedbackComment("");
      setFeedbackContactOptIn(false);
      setFeedbackContactInfo("");
      toast.success("Feedback submitted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Feedback could not be submitted.");
    }
  };

  const handleBirthdayClaim = async () => {
    try {
      if (birthdaySettings.fulfillmentMode === "manual_claim") {
        if (!isBirthdayMonth(user)) {
          toast.error("Birthday rewards unlock during your birthday month.");
          return;
        }
        if (await hasBirthdayClaimedThisYear(user.memberId, user.email)) {
          toast.error("Birthday reward already claimed this year.");
          return;
        }
        await claimBirthdayReward(user.memberId, user.email);
      } else if (!shouldAutoCreditBirthdayReward(user, birthdaySettings)) {
        toast.error("Birthday reward is not available yet.");
        return;
      }

      await refreshUser();
      const status = await loadBirthdayRewardStatus(user.memberId, user.email);
      setBirthdayStatus(status);
      toast.success("Birthday reward status updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Birthday reward could not be checked.");
    }
  };

  const handleShare = async () => {
    const payload = {
      title: "PharmaRewards",
      text: shareMessage,
      url: referralLink || window.location.origin,
    };

    try {
      if (navigator.share) {
        await navigator.share(payload);
      } else {
        await navigator.clipboard.writeText(`${payload.text} ${payload.url}`);
        toast.success("Share text copied.");
      }

      const savedEvent = await recordSocialShareEvent({
        memberIdentifier: user.memberId,
        memberName: user.fullName,
        tier: user.tier,
        channel: "facebook",
        achievement: selectedAchievement,
        referralCode,
        badgeLabel: user.tier,
        shareText: shareMessage,
        destinationUrl: referralLink,
      });
      if (savedEvent) setShareEvents((prev) => [savedEvent, ...prev.filter((event) => event.id !== savedEvent.id)]);
      await loadEngagementData({ silent: true }).catch(() => undefined);
      toast.success("Share tracked.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Share could not be completed.");
    }
  };

  const handleSurveyAnswerChange = (surveyId: string, questionId: string, value: string) => {
    setSurveyAnswers((prev) => ({
      ...prev,
      [surveyId]: {
        ...prev[surveyId],
        [questionId]: value,
      },
    }));
  };

  const handleSubmitSurvey = async () => {
    if (!selectedSurvey) return;
    const answers = surveyAnswers[selectedSurvey.id] ?? {};
    const missingAnswer = selectedSurvey.questions.some((question) => !String(answers[question.id] || "").trim());
    if (missingAnswer) {
      toast.error("Please complete every survey question.");
      return;
    }
    if (completedSurveyIdSet.has(selectedSurvey.id)) {
      toast.error("You already completed this survey.");
      return;
    }

    try {
      setSubmittingSurveyId(selectedSurvey.id);
      const response = await submitSurveyResponseRecord({
        surveyId: selectedSurvey.id,
        memberIdentifier: user.memberId,
        answers,
        bonusPoints: selectedSurvey.bonusPoints,
      });
      await awardPointsViaApi({
        memberIdentifier: user.memberId,
        fallbackEmail: user.email,
        points: selectedSurvey.bonusPoints,
        transactionType: "MANUAL_AWARD",
        reason: `Survey completion (${selectedSurvey.id}): ${selectedSurvey.title}`,
      });

      setSurveys((prev) =>
        prev.map((survey) =>
          survey.id === selectedSurvey.id
            ? {
                ...survey,
                responses: [...survey.responses, response],
              }
            : survey,
        ),
      );
      setCompletedSurveyIds((prev) => (prev.includes(selectedSurvey.id) ? prev : [...prev, selectedSurvey.id]));
      setSurveyAnswers((prev) => {
        const next = { ...prev };
        delete next[selectedSurvey.id];
        return next;
      });
      setUser((prev) => ({ ...prev, surveysCompleted: prev.surveysCompleted + 1 }));
      await refreshUser();
      await loadEngagementData({ silent: true }).catch(() => undefined);
      setSelectedSurveyId(null);
      toast.success(`Survey submitted. +${selectedSurvey.bonusPoints} points added.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Survey could not be submitted.");
    } finally {
      setSubmittingSurveyId(null);
    }
  };

  const goToChallengeAction = (challenge: ChallengeDefinition) => {
    if (challenge.type === "survey-completion") {
      setActiveTab("surveys");
      return;
    }
    navigate("/customer/earn");
  };

  return (
    <div className="mx-auto max-w-[1180px] space-y-5 px-4 py-5 sm:px-5 lg:px-6">
      <section className="grid gap-4 rounded-[16px] border border-[#bfe9e4] bg-[linear-gradient(135deg,#ffffff_0%,#f4fffb_100%)] p-5 shadow-[0_12px_28px_rgba(0,96,86,0.07)] lg:grid-cols-[1fr_280px]">
        <div>
          <div className="inline-flex items-center rounded-full border border-[#bfe5e8] bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#007d87]">
            Engagement Hub
          </div>
          <h1 className="mt-3 text-[28px] font-extrabold leading-tight text-[#071a35] md:text-[30px]">Member Engagement</h1>
          <p className="mt-2 max-w-2xl text-sm text-[#344054] md:text-[15px]">
            Join challenges, share referrals, answer surveys, and unlock member perks.
          </p>
        </div>
        <EngagementHeroArt />
      </section>

      <div className="overflow-x-auto border-b border-[#dce7f3]">
        <div className="flex min-w-max gap-6">
          {engagementTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={`border-b-2 px-1 py-3 text-sm font-semibold transition ${
                activeTab === tab.value
                  ? "border-[#008d97] text-[#008d97]"
                  : "border-transparent text-[#475467] hover:text-[#10213a]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loadingError ? (
        <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Engagement data could not load. Please try again.
        </Card>
      ) : null}

      {activeTab === "overview" ? (
        <div className="space-y-5">
          <section className="rounded-[24px] bg-[linear-gradient(135deg,#061f3f,#008d97)] p-5 text-white shadow-[0_18px_36px_rgba(6,31,63,0.18)]">
            <div className="grid gap-5 lg:grid-cols-[1fr_520px]">
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/12">
                  <UsersRound className="h-6 w-6" />
                </div>
                <h2 className="mt-4 text-2xl font-bold md:text-3xl">Keep your rewards active and visible.</h2>
                <p className="mt-2 max-w-2xl text-sm text-cyan-50">
                  Drive engagement with referrals, member challenges, wellness sharing, surveys, and birthday perks.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm">{liveChallenges.length} live challenges</span>
                  <span className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm">{activeSurveys.length} active surveys</span>
                  <span className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm">{referrals.length} referrals sent</span>
                  <span className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm">Birthday reward {birthdayStatus.hasReward ? "ready" : "tracked"}</span>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                  <p className="text-sm text-cyan-50">Surveys completed</p>
                  <p className="mt-1 text-2xl font-bold">{numberFormat(completedSurveyRecords.length)}</p>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                  <p className="text-sm text-cyan-50">Shares tracked</p>
                  <p className="mt-1 text-2xl font-bold">{numberFormat(shareEvents.length)}</p>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                  <p className="text-sm text-cyan-50">Challenges done</p>
                  <p className="mt-1 text-2xl font-bold">{numberFormat(completedChallenges.length)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("rewards")}
                  className="rounded-2xl border border-white/15 bg-white/10 p-4 text-left transition hover:bg-white/15"
                >
                  <p className="text-sm text-cyan-50">Birthday perk</p>
                  <p className="mt-1 text-2xl font-bold">{birthdayStatus.hasReward ? "Ready" : "Pending"}</p>
                  <p className="mt-1 text-xs text-cyan-50">View your reward</p>
                </button>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-4">
            <MetricCard icon={UsersRound} label="Referral joins" value={numberFormat(referralJoins)} detail={`${referrals.length} invites tracked`} />
            <MetricCard icon={Trophy} label="Active challenges" value={numberFormat(liveChallenges.length)} detail={`${availableChallengePoints} points available`} accent="purple" />
            <MetricCard icon={ClipboardCheck} label="Surveys completed" value={numberFormat(completedSurveyRecords.length)} detail={`${activeSurveys.length} available now`} accent="blue" />
            <MetricCard icon={Share2} label="Shares tracked" value={numberFormat(shareEvents.length)} detail="Referral sharing history" accent="green" />
          </section>

          <section className="grid gap-4 lg:grid-cols-[1fr_390px]">
            <div className="grid gap-4 lg:grid-cols-3">
              <SectionCard className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-bold text-[#10213a]">Referral Snapshot</h3>
                  <Button variant="outline" size="sm" onClick={() => copyText(referralCode, "Referral code copied.")}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy code
                  </Button>
                </div>
                <p className="mt-4 text-xs uppercase tracking-[0.12em] text-[#667085]">Your referral code</p>
                <div className="mt-2 rounded-2xl border border-dashed border-[#9edce0] bg-[#f8fcff] px-4 py-3 text-center text-xl font-bold text-[#008d97]">
                  {referralCode || "Loading"}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><p className="font-bold text-[#10213a]">{numberFormat(referrals.length)}</p><p className="text-[#667085]">Invites</p></div>
                  <div><p className="font-bold text-[#10213a]">{numberFormat(referralJoins)}</p><p className="text-[#667085]">Joined</p></div>
                </div>
                <Button className="mt-4 w-full bg-[#008d97] text-white hover:bg-[#007982]" onClick={() => setActiveTab("rewards")}>
                  Invite Friend
                </Button>
              </SectionCard>

              <SectionCard className="p-5">
                <h3 className="text-base font-bold text-[#10213a]">Challenge Progress</h3>
                {liveChallenges.length > 0 ? (
                  <div className="mt-4 space-y-4">
                    {liveChallenges.slice(0, 1).map((challenge) => {
                      const progress = getChallengeProgress(challenge, user);
                      return (
                        <div key={challenge.id}>
                          <p className="font-semibold text-[#10213a]">{challenge.title}</p>
                          <p className="mt-1 text-sm text-[#667085]">{challenge.description}</p>
                          <Progress className="mt-3 h-2" value={progress.percent} />
                          <p className="mt-2 text-xs text-[#667085]">{progress.current}/{progress.target} {challenge.unitLabel}</p>
                        </div>
                      );
                    })}
                    <Button variant="outline" className="w-full border-[#bfd3ea]" onClick={() => setActiveTab("challenges")}>
                      View Challenges
                    </Button>
                  </div>
                ) : (
                  <EmptyState icon={Target} title="No live challenges" body="New pharmacy rewards challenges will appear here." actionLabel="View Earn Points" onAction={() => navigate("/customer/earn")} />
                )}
              </SectionCard>

              <SectionCard className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-bold text-[#10213a]">Birthday Reward</h3>
                  <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">{birthdayStatus.hasReward ? "Ready" : "Tracked"}</Badge>
                </div>
                <p className="mt-4 text-sm text-[#667085]">Your birthday bonus</p>
                <p className="mt-1 text-2xl font-bold text-[#008d97]">{numberFormat(birthdayPoints)} points</p>
                <p className="mt-2 text-sm text-[#667085]">
                  {birthdayStatus.hasReward ? "Recorded for this year." : "Availability depends on your birthday schedule."}
                </p>
                <Button variant="outline" className="mt-4 w-full border-[#bfd3ea]" onClick={() => setActiveTab("rewards")}>
                  Check Status
                </Button>
              </SectionCard>
            </div>

            <SectionCard className="border-emerald-100 bg-emerald-50/70 p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-emerald-700">
                  <ArrowRight className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Next best action</p>
                  <h3 className="mt-1 text-lg font-bold text-[#10213a]">{nextBestAction.title}</h3>
                  <p className="mt-1 text-sm text-[#667085]">{nextBestAction.body}</p>
                </div>
              </div>
              <Button className="mt-5 w-full bg-emerald-700 text-white hover:bg-emerald-800" onClick={nextBestAction.action}>
                {nextBestAction.actionLabel}
              </Button>
            </SectionCard>
          </section>
        </div>
      ) : null}

      {activeTab === "rewards" ? (
        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <SectionCard className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-[#008d97]">
                <UsersRound className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#008d97]">Referral Program</p>
                <h2 className="text-xl font-bold text-[#10213a]">Invite. Earn. Repeat.</h2>
                <p className="text-sm text-[#667085]">Share your code and track referral joins from the backend.</p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-dashed border-[#9edce0] bg-[#f8fcff] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-[#667085]">Your referral code</p>
                  <p className="mt-1 text-2xl font-bold text-[#008d97]">{referralCode || "Loading"}</p>
                </div>
                <Button variant="outline" className="border-[#bfd3ea]" onClick={() => copyText(referralCode, "Referral code copied.")}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Code
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#dce7f3] p-4"><p className="text-xs text-[#667085]">Referrals Sent</p><p className="mt-1 text-xl font-bold text-[#10213a]">{numberFormat(referrals.length)}</p></div>
              <div className="rounded-2xl border border-[#dce7f3] p-4"><p className="text-xs text-[#667085]">Successful Joins</p><p className="mt-1 text-xl font-bold text-[#10213a]">{numberFormat(referralJoins)}</p></div>
              <div className="rounded-2xl border border-[#dce7f3] p-4"><p className="text-xs text-[#667085]">Reward Status</p><p className="mt-1 text-xl font-bold text-[#10213a]">{referralJoins > 0 ? "Active" : "Ready"}</p></div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Button variant="outline" className="border-[#bfd3ea]" onClick={() => copyText(referralLink, "Referral link copied.")}>
                <Copy className="mr-2 h-4 w-4" />
                Share Link
              </Button>
              <Button variant="outline" className="border-[#bfd3ea]" onClick={() => copyText(referralLink, "QR link copied.")}>
                <QrCode className="mr-2 h-4 w-4" />
                Copy QR Link
              </Button>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_180px]">
              <div>
                <Label htmlFor="referral-email">Invite a friend directly</Label>
                <div className="mt-2 flex gap-2">
                  <Input id="referral-email" type="email" value={referralEmail} onChange={(event) => setReferralEmail(event.target.value)} placeholder="friend@email.com" />
                  <Button className="bg-[#008d97] text-white hover:bg-[#007982]" onClick={handleCreateReferral}>
                    Create Referral
                  </Button>
                </div>
              </div>
              <div className="rounded-2xl border border-[#dce7f3] bg-white p-3 text-center">
                <p className="mb-2 text-xs font-semibold text-[#667085]">Scan to share</p>
                {qrDataUrl ? <img src={qrDataUrl} alt="Referral QR code" className="mx-auto h-32 w-32" /> : <QrCode className="mx-auto h-24 w-24 text-[#98a2b3]" />}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-[#dce7f3]">
              {referrals.slice(0, 5).map((referral) => (
                <div key={referral.id} className="flex items-center justify-between gap-3 border-b border-[#e5edf6] px-4 py-3 last:border-b-0">
                  <div>
                    <p className="text-sm font-semibold text-[#10213a]">{referral.refereeEmail}</p>
                    <p className="text-xs text-[#667085]">{dateLabel(referral.createdAt)}</p>
                  </div>
                  <Badge variant="outline" className={statusPillClass(referral.status === "joined" ? "complete" : "available")}>
                    {referral.status === "joined" ? "Joined" : "Pending"}
                  </Badge>
                </div>
              ))}
              {referrals.length === 0 ? (
                <div className="p-4">
                  <EmptyState icon={UsersRound} title="No referrals yet" body="Create a referral invite to start tracking joins." />
                </div>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <MessageSquareText className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">Feedback</p>
                <h2 className="text-xl font-bold text-[#10213a]">Tell us what you think</h2>
                <p className="text-sm text-[#667085]">Your feedback helps improve the pharmacy rewards experience.</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <Label>Category</Label>
                <select className="mt-2 w-full rounded-xl border border-[#d0d8e5] bg-white px-3 py-2 text-sm" value={feedbackCategory} onChange={(event) => setFeedbackCategory(event.target.value as any)}>
                  <option value="points">Points</option>
                  <option value="rewards">Rewards</option>
                  <option value="service">Service</option>
                  <option value="app">App</option>
                </select>
              </div>
              <div>
                <Label>Rating</Label>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFeedbackRating(value as 1 | 2 | 3 | 4 | 5)}
                      className={`rounded-xl border p-2 transition ${feedbackRating >= value ? "border-amber-300 bg-amber-50 text-amber-600" : "border-[#dce7f3] text-[#98a2b3]"}`}
                    >
                      <Star className={`h-5 w-5 ${feedbackRating >= value ? "fill-current" : ""}`} />
                    </button>
                  ))}
                  <span className="text-sm text-[#667085]">{feedbackRating}/5</span>
                </div>
              </div>
              <div>
                <Label>Comments</Label>
                <Textarea className="mt-2 min-h-[132px]" maxLength={500} value={feedbackComment} onChange={(event) => setFeedbackComment(event.target.value)} placeholder="Share your feedback..." />
                <p className="mt-1 text-right text-xs text-[#667085]">{feedbackComment.length}/500</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-[#475467]">
                <input type="checkbox" checked={feedbackContactOptIn} onChange={(event) => setFeedbackContactOptIn(event.target.checked)} />
                Stay in touch for follow-up
              </label>
              {feedbackContactOptIn ? (
                <Input value={feedbackContactInfo} onChange={(event) => setFeedbackContactInfo(event.target.value)} placeholder="Email or phone" />
              ) : null}
              <Button className="w-full bg-[#008d97] text-white hover:bg-[#007982]" onClick={handleFeedbackSubmit}>
                Submit Feedback
              </Button>
              <p className="flex items-center justify-center gap-2 text-xs text-[#667085]">
                <Lock className="h-3.5 w-3.5" />
                Your feedback is private and secure.
              </p>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {activeTab === "challenges" ? (
        <div className="space-y-5">
          <section className="grid gap-4 md:grid-cols-4">
            <MetricCard icon={Trophy} label="Active challenges" value={numberFormat(liveChallenges.length)} detail="Keep going" accent="blue" />
            <MetricCard icon={CheckCircle2} label="Completed" value={numberFormat(completedChallenges.length)} detail="Challenge wins" accent="green" />
            <MetricCard icon={Gift} label="Points available" value={numberFormat(availableChallengePoints)} detail="Unfinished rewards" accent="purple" />
            <MetricCard icon={CalendarDays} label="Ending soon" value={numberFormat(endingSoon)} detail="Within 7 days" />
          </section>

          <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
            <SectionCard className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[#10213a]">Active Challenges</h2>
                  <p className="text-sm text-[#667085]">Build healthy habits and earn bonus points.</p>
                </div>
                <Button variant="outline" className="border-[#bfd3ea]" onClick={() => navigate("/customer/earn")}>
                  View Earn Points
                </Button>
              </div>

              {liveChallenges.length > 0 ? (
                <div className="grid gap-4 lg:grid-cols-3">
                  {liveChallenges.map((challenge) => {
                    const progress = getChallengeProgress(challenge, user);
                    const Icon = challengeIcon(challenge);
                    const complete = progress.completed;
                    return (
                      <div key={challenge.id} className="rounded-2xl border border-[#dce7f3] bg-[#fbfdff] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                            <Icon className="h-7 w-7" />
                          </div>
                          <Badge variant="outline" className={statusPillClass(complete ? "complete" : "active")}>
                            {complete ? "Completed" : "In Progress"}
                          </Badge>
                        </div>
                        <h3 className="mt-4 text-base font-bold text-[#10213a]">{challenge.title}</h3>
                        <p className="mt-2 text-sm text-[#667085]">{challenge.description}</p>
                        <div className="mt-4 flex items-center justify-between text-xs text-[#475467]">
                          <span>{progress.current} of {progress.target} {challenge.unitLabel}</span>
                          <span>{Math.round(progress.percent)}%</span>
                        </div>
                        <Progress className="mt-2 h-2" value={progress.percent} />
                        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                          <div className="rounded-xl bg-white p-3"><Gift className="mb-1 h-4 w-4 text-[#008d97]" />Reward<br /><b>{challenge.rewardPoints} pts</b></div>
                          <div className="rounded-xl bg-white p-3"><CalendarDays className="mb-1 h-4 w-4 text-[#008d97]" />Ends<br /><b>{dateLabel(challenge.endAt)}</b></div>
                        </div>
                        <Button
                          disabled={complete}
                          className="mt-4 w-full bg-[#008d97] text-white hover:bg-[#007982] disabled:bg-slate-200 disabled:text-slate-600"
                          onClick={() => goToChallengeAction(challenge)}
                        >
                          {complete ? "Completed" : progress.current > 0 ? "Continue Challenge" : "Start Challenge"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState icon={Trophy} title="No live challenges right now." body="New wellness and pharmacy rewards challenges will appear here." actionLabel="View Earn Points" onAction={() => navigate("/customer/earn")} />
              )}
            </SectionCard>

            <SectionCard className="p-5">
              <h2 className="text-lg font-bold text-[#10213a]">Challenge Benefits</h2>
              <div className="mt-4 space-y-4">
                {[
                  ["Earn bonus points", "Redeem for pharmacy rewards."],
                  ["Build healthy habits", "One small step at a time."],
                  ["Stay motivated", "Track progress and streaks."],
                ].map(([title, body]) => (
                  <div key={title} className="flex gap-3">
                    <BadgeCheck className="h-5 w-5 text-[#008d97]" />
                    <div><p className="text-sm font-semibold text-[#10213a]">{title}</p><p className="text-sm text-[#667085]">{body}</p></div>
                  </div>
                ))}
              </div>
              <div className="mt-6 border-t border-[#e5edf6] pt-5">
                <h3 className="font-bold text-[#10213a]">How it works</h3>
                <ol className="mt-3 space-y-3 text-sm text-[#667085]">
                  <li><b className="text-[#008d97]">1.</b> Join a challenge that fits your goals.</li>
                  <li><b className="text-[#008d97]">2.</b> Complete activities and track progress.</li>
                  <li><b className="text-[#008d97]">3.</b> Earn rewards when completed.</li>
                </ol>
              </div>
            </SectionCard>
          </div>
        </div>
      ) : null}

      {activeTab === "sharing" ? (
        <div className="space-y-5">
          <section className="grid gap-4 md:grid-cols-4">
            <MetricCard icon={Share2} label="Shares tracked" value={numberFormat(shareEvents.length)} detail="All time" />
            <MetricCard icon={UsersRound} label="Referral clicks" value={numberFormat(shareEvents.reduce((sum, item) => sum + item.conversions, 0))} detail="Tracked conversions" accent="blue" />
            <MetricCard icon={Trophy} label="Best share" value={shareEvents[0]?.achievement ? "Active" : "None"} detail={shareEvents[0]?.achievement || "No shares yet"} accent="purple" />
            <MetricCard icon={Gift} label="Referral code" value={referralCode || "Pending"} detail="Embedded in share card" accent="green" />
          </section>

          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <SectionCard className="p-5">
              <h2 className="text-xl font-bold text-[#10213a]">Social Sharing</h2>
              <p className="mt-1 text-sm text-[#667085]">Create and share a clean rewards or referral card.</p>

              <div className="mt-5 space-y-4">
                <div>
                  <Label>Achievement to share</Label>
                  <select className="mt-2 w-full rounded-xl border border-[#d0d8e5] bg-white px-3 py-2 text-sm" value={selectedAchievement} onChange={(event) => setSelectedAchievement(event.target.value)}>
                    <option>Shared a wellness rewards update</option>
                    <option>Completed a health survey</option>
                    <option>Invited a friend to pharmacy rewards</option>
                    <option>Reached a new reward tier</option>
                  </select>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-2xl border border-[#dce7f3] p-3 text-sm"><input type="checkbox" checked={privacySettings.showName} onChange={(event) => updatePrivacy({ showName: event.target.checked })} />Show name</label>
                  <label className="flex items-center gap-2 rounded-2xl border border-[#dce7f3] p-3 text-sm"><input type="checkbox" checked={showTier} onChange={(event) => setShowTier(event.target.checked)} />Show tier</label>
                  <label className="flex items-center gap-2 rounded-2xl border border-[#dce7f3] p-3 text-sm"><input type="checkbox" checked={privacySettings.showReferralCode} onChange={(event) => updatePrivacy({ showReferralCode: event.target.checked })} />Show referral code</label>
                  <label className="flex items-center gap-2 rounded-2xl border border-[#dce7f3] p-3 text-sm"><input type="checkbox" checked={privacySettings.publicProfile} onChange={(event) => updatePrivacy({ publicProfile: event.target.checked })} />Public profile</label>
                </div>

                <div>
                  <Label>Text preview</Label>
                  <Textarea className="mt-2" value={shareCaption} onChange={(event) => setShareCaption(event.target.value)} maxLength={220} placeholder="Customize your share caption..." />
                  <p className="mt-1 text-right text-xs text-[#667085]">{shareCaption.length}/220</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Button className="bg-[#008d97] text-white hover:bg-[#007982]" onClick={handleShare}>
                    <Share2 className="mr-2 h-4 w-4" />
                    Open Share Sheet
                  </Button>
                  <Button variant="outline" className="border-[#bfd3ea]" onClick={copyShareCardText}>
                    Copy Card Text
                  </Button>
                  <Button variant="outline" className="border-[#bfd3ea]" onClick={() => copyText(referralLink, "Referral link copied.")}>
                    Copy Link
                  </Button>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-[#10213a]">Share History</h3>
                  <div className="mt-3 space-y-2">
                    {shareEvents.slice(0, 5).map((event) => (
                      <div key={event.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#e5edf6] p-3">
                        <div>
                          <p className="text-sm font-semibold text-[#10213a]">{event.achievement}</p>
                          <p className="text-xs text-[#667085]">{dateLabel(event.createdAt)} - {event.conversions} tracked conversion(s)</p>
                        </div>
                        <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Published</Badge>
                      </div>
                    ))}
                    {shareEvents.length === 0 ? <EmptyState icon={Share2} title="No recent shares yet." body="Open the share sheet to create your first tracked share." /> : null}
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard className="p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-[#10213a]">Preview</h2>
                  <p className="text-sm text-[#667085]">This is how your share card will look.</p>
                </div>
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  {privacySettings.publicProfile ? "Public" : "Private"}
                </Badge>
              </div>

              <div className="rounded-[28px] bg-[linear-gradient(135deg,#f4fbff,#eaf5ff)] p-6">
                <div className="mx-auto max-w-[620px] overflow-hidden rounded-[28px] border border-[#bcd5ee] bg-white shadow-[0_24px_48px_rgba(15,35,60,0.14)]">
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2 text-[#008d97]">
                        <ShieldPlus className="h-8 w-8" />
                        <div>
                          <p className="text-xl font-bold text-[#10213a]">PharmaRewards</p>
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#008d97]">Pharmacy Rewards</p>
                        </div>
                      </div>
                      {showTier ? <Badge className="bg-[#10213a] text-white hover:bg-[#10213a]">{user.tier} Member</Badge> : null}
                    </div>
                    <div className="mt-8 grid gap-6 md:grid-cols-[1fr_190px] md:items-center">
                      <div>
                        <p className="text-3xl font-bold text-[#10213a]">
                          {privacySettings.showName ? `I'm ${user.fullName}` : "I'm a rewards member"}
                        </p>
                        <p className="mt-2 text-lg text-[#344054]">{selectedAchievement}</p>
                        <div className="mt-5 flex flex-wrap gap-4 text-sm">
                          <span><b>{numberFormat(user.points)}</b> points</span>
                          <span><b>{numberFormat(completedChallenges.length)}</b> challenges</span>
                          <span><b>{numberFormat(referralJoins)}</b> joins</span>
                        </div>
                      </div>
                      <div className="flex h-44 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                        <ShieldPlus className="h-24 w-24" />
                      </div>
                    </div>
                  </div>
                  <div className="bg-[linear-gradient(135deg,#062040,#008d97)] p-6 text-white">
                    <p className="text-xl font-bold">Join me and earn pharmacy rewards.</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <span>Referral code:</span>
                      <span className="rounded-xl bg-white px-4 py-2 font-bold text-[#10213a]">
                        {privacySettings.showReferralCode ? referralCode || "Pending" : "Hidden"}
                      </span>
                    </div>
                    <p className="mt-4 text-sm text-cyan-50">Better health. Better rewards.</p>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      ) : null}

      {activeTab === "surveys" ? (
        <div className="space-y-5">
          <section className="grid gap-4 md:grid-cols-3">
            <MetricCard icon={ClipboardCheck} label="Available surveys" value={numberFormat(activeSurveys.filter((survey) => !completedSurveyIdSet.has(survey.id)).length)} detail="Ready for you" />
            <MetricCard icon={CheckCircle2} label="Completed surveys" value={numberFormat(completedSurveyRecords.length)} detail="Submitted responses" accent="green" />
            <MetricCard icon={Gift} label="Survey points earned" value={`${numberFormat(surveyPointsEarned)} pts`} detail="From survey history" accent="purple" />
          </section>

          <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
            <SectionCard className="p-5">
              <h2 className="text-xl font-bold text-[#10213a]">Available Surveys</h2>
              <p className="mt-1 text-sm text-[#667085]">Answer customer feedback surveys and earn points after submit.</p>

              <div className="mt-5 space-y-3">
                {activeSurveys.map((survey) => {
                  const completed = completedSurveyIdSet.has(survey.id);
                  return (
                    <div key={survey.id} className="grid gap-4 rounded-2xl border border-[#dce7f3] p-4 md:grid-cols-[1fr_auto] md:items-center">
                      <div className="flex gap-4">
                        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-cyan-50 text-[#008d97]">
                          <ClipboardCheck className="h-7 w-7" />
                        </div>
                        <div>
                          <h3 className="font-bold text-[#10213a]">{survey.title}</h3>
                          <p className="mt-1 text-sm text-[#667085]">{survey.description}</p>
                          <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#475467]">
                            <span>Category: {survey.segment}</span>
                            <span>Est. time: {Math.max(3, survey.questions.length * 2)}-{Math.max(5, survey.questions.length * 3)} min</span>
                            <span>Reward: {survey.bonusPoints} pts</span>
                          </div>
                        </div>
                      </div>
                      <Button
                        disabled={completed}
                        className="bg-[#008d97] text-white hover:bg-[#007982] disabled:bg-slate-200 disabled:text-slate-600"
                        onClick={() => setSelectedSurveyId(survey.id)}
                      >
                        {completed ? "Completed" : "Start Survey"}
                      </Button>
                    </div>
                  );
                })}
                {activeSurveys.length === 0 ? (
                  <EmptyState
                    icon={ClipboardCheck}
                    title="No surveys available right now."
                    body="New feedback opportunities will appear here."
                    actionLabel="Back to Earn Points"
                    onAction={() => navigate("/customer/earn")}
                  />
                ) : null}
              </div>
            </SectionCard>

            <div className="space-y-5">
              <SectionCard className="p-5">
                <h2 className="text-lg font-bold text-[#10213a]">Completed Survey History</h2>
                <div className="mt-4 space-y-3">
                  {completedSurveyRecords.slice(0, 5).map(({ survey, response }) => (
                    <div key={`${survey.id}-${response.submittedAt}`} className="flex items-center justify-between gap-3 rounded-2xl border border-[#e5edf6] p-3">
                      <div>
                        <p className="text-sm font-semibold text-[#10213a]">{survey.title}</p>
                        <p className="text-xs text-[#667085]">{dateLabel(response.submittedAt)}</p>
                      </div>
                      <span className="text-sm font-bold text-emerald-700">+{survey.bonusPoints} pts</span>
                    </div>
                  ))}
                  {completedSurveyRecords.length === 0 ? (
                    <p className="text-sm text-[#667085]">Completed surveys will appear here after submission.</p>
                  ) : null}
                </div>
              </SectionCard>

              <SectionCard className="p-5">
                <div className="flex items-center gap-3">
                  <Bell className="h-6 w-6 text-[#008d97]" />
                  <div>
                    <h3 className="font-bold text-[#10213a]">Survey availability</h3>
                    <p className="text-sm text-[#667085]">Check back when new pharmacy feedback opportunities are published.</p>
                  </div>
                </div>
              </SectionCard>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={Boolean(selectedSurvey)} onOpenChange={(open) => !open && setSelectedSurveyId(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedSurvey?.title || "Survey"}</DialogTitle>
            <DialogDescription>{selectedSurvey?.description || "Complete every question before submitting."}</DialogDescription>
          </DialogHeader>

          {selectedSurvey ? (
            <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
              {selectedSurvey.questions.map((question) => (
                <div key={question.id} className="rounded-2xl border border-[#dce7f3] p-4">
                  <Label>{question.prompt}</Label>
                  {question.type === "rating" ? (
                    <div className="mt-3 flex gap-2">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => handleSurveyAnswerChange(selectedSurvey.id, question.id, String(value))}
                          className={`h-10 w-10 rounded-xl border text-sm font-bold ${
                            surveyAnswers[selectedSurvey.id]?.[question.id] === String(value)
                              ? "border-[#008d97] bg-[#008d97] text-white"
                              : "border-[#dce7f3] bg-white text-[#475467]"
                          }`}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  ) : question.type === "multiple-choice" ? (
                    <div className="mt-3 grid gap-2">
                      {(question.options || []).map((option) => (
                        <label key={option} className="flex items-center gap-2 rounded-xl border border-[#dce7f3] px-3 py-2 text-sm">
                          <input
                            type="radio"
                            name={`${selectedSurvey.id}-${question.id}`}
                            checked={surveyAnswers[selectedSurvey.id]?.[question.id] === option}
                            onChange={() => handleSurveyAnswerChange(selectedSurvey.id, question.id, option)}
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <Textarea
                      className="mt-3"
                      value={surveyAnswers[selectedSurvey.id]?.[question.id] || ""}
                      onChange={(event) => handleSurveyAnswerChange(selectedSurvey.id, question.id, event.target.value)}
                      placeholder="Share your answer"
                    />
                  )}
                </div>
              ))}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedSurveyId(null)}>Cancel</Button>
            <Button
              className="bg-[#008d97] text-white hover:bg-[#007982]"
              disabled={!selectedSurvey || submittingSurveyId === selectedSurvey.id}
              onClick={handleSubmitSurvey}
            >
              {submittingSurveyId ? "Submitting..." : `Submit for ${selectedSurvey?.bonusPoints || 0} pts`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
