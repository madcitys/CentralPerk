import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Award, Download, Facebook, Instagram, Share2, Star, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
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
import { awardMemberPoints } from "../../lib/loyalty-supabase";
import { supabase } from "../../../utils/supabase/client";
import type { LoyaltyTransaction, Member } from "../../admin-panel/types";
import {
  claimBirthdayReward,
  createReferral,
  getMemberReferralCode,
  getBirthdayRewardPoints,
  hasBirthdayClaimedThisYear,
  isBirthdayMonth,
  loadBirthdayRewardStatus,
  loadReferrals,
  queueManagerFeedbackNotification,
  submitFeedback,
  type ReferralRecord,
} from "../../lib/member-lifecycle";
import {
  buildShareAssetDataUrl,
  getChallengeLeaderboard,
  getChallengeProgress,
  getMemberPrivacySettings,
  loadEngagementState,
  saveEngagementState,
  triggerDownload,
  type EngagementState,
  type SharePrivacySettings,
  type SocialChannel,
} from "../../lib/member-engagement";

type EngagementTab = "overview" | "rewards" | "challenges" | "sharing" | "surveys";

const engagementTabs: { value: EngagementTab; label: string; hash: string }[] = [
  { value: "overview", label: "Overview", hash: "#engagement-overview" },
  { value: "rewards", label: "Referral & Feedback", hash: "#engagement-rewards" },
  { value: "challenges", label: "Challenges", hash: "#engagement-challenges" },
  { value: "sharing", label: "Sharing", hash: "#engagement-sharing" },
  { value: "surveys", label: "Surveys", hash: "#engagement-surveys" },
];

export default function CustomerEngagementPage() {
  const { user, refreshUser, setUser } = useOutletContext<AppOutletContext>();
  const [activeTab, setActiveTab] = useState<EngagementTab>("overview");
  const [state, setState] = useState<EngagementState>(() => loadEngagementState());
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [selectedAchievement, setSelectedAchievement] = useState("Tier upgrade unlocked");
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, Record<string, string>>>({});
  const [submittingSurveyId, setSubmittingSurveyId] = useState<string | null>(null);
  const [claimingChallengeId, setClaimingChallengeId] = useState<string | null>(null);
  const [referralEmail, setReferralEmail] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [myReferrals, setMyReferrals] = useState<ReferralRecord[]>([]);
  const [birthdayStatus, setBirthdayStatus] = useState<{ hasReward: boolean; voucherCode: string | null; pointsAwarded: number; badgeLabel: string | null; voucherExpiresAt?: string }>({
    hasReward: false,
    voucherCode: null,
    pointsAwarded: 0,
    badgeLabel: null,
  });
  const [feedbackCategory, setFeedbackCategory] = useState<"points" | "rewards" | "service" | "app">("service");
  const [feedbackRating, setFeedbackRating] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackContactOptIn, setFeedbackContactOptIn] = useState(false);
  const [feedbackContactInfo, setFeedbackContactInfo] = useState("");
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [leaderboardMembers, setLeaderboardMembers] = useState<Member[]>([]);
  const [leaderboardTransactions, setLeaderboardTransactions] = useState<LoyaltyTransaction[]>([]);

  useEffect(() => {
    saveEngagementState(state);
  }, [state]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const matchedTab = engagementTabs.find((tab) => tab.hash === hash);
    if (matchedTab) {
      setActiveTab(matchedTab.value);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const current = engagementTabs.find((tab) => tab.value === activeTab);
    if (!current) return;
    const nextUrl = `${window.location.pathname}${window.location.search}${current.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [activeTab]);

  const privacySettings = useMemo<SharePrivacySettings>(
    () => getMemberPrivacySettings(state, user.memberId),
    [state, user.memberId]
  );
  useEffect(() => {
    getMemberReferralCode(user.memberId, user.email)
      .then(setReferralCode)
      .catch(() => setReferralCode(""));
    loadReferrals(user.memberId)
      .then(setMyReferrals)
      .catch(() => setMyReferrals([]));
    loadBirthdayRewardStatus(user.memberId, user.email)
      .then(setBirthdayStatus)
      .catch(() => setBirthdayStatus({ hasReward: false, voucherCode: null, pointsAwarded: 0, badgeLabel: null }));
  }, [user.memberId, user.email]);

  useEffect(() => {
    let alive = true;

    Promise.all([
      supabase
        .from("loyalty_members")
        .select("member_id,id,member_number,first_name,last_name,email,phone,enrollment_date,points_balance,tier,last_activity_at"),
      supabase
        .from("loyalty_transactions")
        .select("transaction_id,member_id,points,transaction_type,transaction_date,amount_spent,receipt_id,expiry_date,reward_catalog_id,promotion_campaign_id,product_code,product_category,reason,description"),
    ])
      .then(([membersRes, transactionsRes]) => {
        if (!alive) return;
        setLeaderboardMembers((membersRes.data as Member[] | null) ?? []);
        setLeaderboardTransactions((transactionsRes.data as LoyaltyTransaction[] | null) ?? []);
      })
      .catch(() => {
        if (!alive) return;
        setLeaderboardMembers([]);
        setLeaderboardTransactions([]);
      });

    return () => {
      alive = false;
    };
  }, []);
  const sharePreview = useMemo(
    () =>
      buildShareAssetDataUrl({
        memberName: user.fullName,
        tier: user.tier,
        achievement: selectedAchievement,
        referralCode,
        privacy: privacySettings,
      }),
    [privacySettings, referralCode, selectedAchievement, user.fullName, user.tier]
  );

  const claimedChallenges = new Set(state.claimedChallengeRewardsByMember[user.memberId] ?? []);
  const activeSurveys = state.surveys.filter((survey) => survey.status === "live");
  const memberShareEvents = state.shareEvents.filter((item) => item.memberId === user.memberId);
  const competitiveChallenge = state.challenges.find((challenge) => challenge.competitive);
  const activeChallenges = state.challenges.filter((challenge) => new Date(challenge.endAt).getTime() > countdownNow);
  const completedChallengesCount = activeChallenges.filter((challenge) => getChallengeProgress(challenge, user).completed).length;
  const nextChallenge = activeChallenges
    .map((challenge) => ({ challenge, progress: getChallengeProgress(challenge, user) }))
    .sort((left, right) => right.progress.percent - left.progress.percent)[0];
  const recentShare = memberShareEvents[0];
  const challengeLeaderboard = useMemo(
    () => (competitiveChallenge ? getChallengeLeaderboard(competitiveChallenge, leaderboardMembers, leaderboardTransactions) : []),
    [competitiveChallenge, leaderboardMembers, leaderboardTransactions]
  );
  const highlightedLeaderboard = useMemo(() => {
    const topRows = challengeLeaderboard.slice(0, 5);
    const currentMemberRow = challengeLeaderboard.find((row) => row.memberId === user.memberId);
    if (!currentMemberRow || topRows.some((row) => row.memberId === currentMemberRow.memberId)) {
      return topRows;
    }
    return [...topRows, currentMemberRow];
  }, [challengeLeaderboard, user.memberId]);

  const formatTimeRemaining = (targetDate: string) => {
    const diffMs = new Date(targetDate).getTime() - countdownNow;
    if (diffMs <= 0) return "Ended";

    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s remaining`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s remaining`;
    return `${minutes}m ${seconds}s remaining`;
  };

  const updatePrivacy = (patch: Partial<SharePrivacySettings>) => {
    setState((prev) => ({
      ...prev,
      privacySettingsByMember: {
        ...prev.privacySettingsByMember,
        [user.memberId]: {
          ...getMemberPrivacySettings(prev, user.memberId),
          ...patch,
        },
      },
    }));
  };

  const handleShare = (channel: SocialChannel) => {
    setShareSheetOpen(false);
    const nextEvent = {
      id: crypto.randomUUID(),
      memberId: user.memberId,
      memberName: user.fullName,
      tier: user.tier,
      channel,
      achievement: selectedAchievement,
      referralCode,
      conversions: 0,
      createdAt: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      shareEvents: [nextEvent, ...prev.shareEvents],
    }));

    if (channel === "facebook") {
      const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent("https://centralperk.example/member")}&quote=${encodeURIComponent(`${selectedAchievement} | Referral code: ${referralCode}`)}`;
      window.open(shareUrl, "_blank", "noopener,noreferrer");
    } else {
      triggerDownload(sharePreview, `centralperk-${user.memberId}-story-card.svg`);
      toast.success("Instagram share asset downloaded.", {
        description: "Upload the generated image to your story or post.",
      });
    }

    toast.success(`Shared to ${channel === "facebook" ? "Facebook" : "Instagram"}.`);
  };

  const handleMockConversion = (shareId: string) => {
    setState((prev) => ({
      ...prev,
      shareEvents: prev.shareEvents.map((item) =>
        item.id === shareId ? { ...item, conversions: item.conversions + 1 } : item
      ),
    }));
  };

  const handleClaimChallenge = async (challengeId: string, rewardPoints: number, title: string) => {
    try {
      setClaimingChallengeId(challengeId);
      await awardMemberPoints({
        memberIdentifier: user.memberId,
        fallbackEmail: user.email,
        points: rewardPoints,
        transactionType: "MANUAL_AWARD",
        reason: `Challenge reward (${challengeId}): ${title}`,
      });

      setState((prev) => ({
        ...prev,
        claimedChallengeRewardsByMember: {
          ...prev.claimedChallengeRewardsByMember,
          [user.memberId]: [...new Set([...(prev.claimedChallengeRewardsByMember[user.memberId] ?? []), challengeId])],
        },
      }));

      await refreshUser();
      toast.success(`Challenge reward claimed. +${rewardPoints} points`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to claim challenge reward.");
    } finally {
      setClaimingChallengeId(null);
    }
  };



  const handleCreateReferral = () => {
    const email = referralEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast.error("Enter a valid friend email.");
      return;
    }

    createReferral({
      referrerMemberId: user.memberId,
      refereeEmail: email,
    })
      .then(() => loadReferrals(user.memberId))
      .then((rows) => {
        setMyReferrals(rows);
        setReferralEmail("");
        toast.success("Referral created. Share your code via SMS, email, or QR flow.");
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to create referral."));
  };

  const handleBirthdayClaim = async () => {
    if (!isBirthdayMonth(user)) {
      toast.error("Birthday rewards unlock on your birthday month.");
      return;
    }
    const alreadyClaimed = await hasBirthdayClaimedThisYear(user.memberId, user.email);
    if (alreadyClaimed) {
      toast.error("Birthday reward already claimed this year.");
      return;
    }
    try {
      const result = await claimBirthdayReward(user.memberId, user.email);
      await refreshUser();
      const status = await loadBirthdayRewardStatus(user.memberId, user.email);
      setBirthdayStatus(status);
      toast.success(
        result.granted
          ? `Birthday reward credited: +${result.pointsAwarded || getBirthdayRewardPoints(user.tier)} points.`
          : "Birthday reward is already granted for this year."
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to claim birthday reward.");
    }
  };

  const referralLink = referralCode ? `${window.location.origin}/register?ref=${encodeURIComponent(referralCode)}` : "";
  const shareMessage = `${selectedAchievement} | Referral code: ${referralCode || "pending"} | Join here: ${referralLink || "link pending"}`;

  const handleFeedbackSubmit = async () => {
    const comment = feedbackComment.trim();
    if (!comment) {
      toast.error("Feedback comment is required.");
      return;
    }
    if (comment.length > 500) {
      toast.error("Feedback must be 500 characters or less.");
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
      try {
        await queueManagerFeedbackNotification(saved);
      } catch {
        // Feedback is already saved; notification failure should not block submission.
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit feedback.");
      return;
    }

    setFeedbackComment("");
    setFeedbackContactOptIn(false);
    setFeedbackContactInfo("");
    toast.success("Feedback submitted. Thank you!");
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

  const handleSubmitSurvey = async (surveyId: string) => {
    const survey = state.surveys.find((item) => item.id === surveyId);
    if (!survey) return;

    const answers = surveyAnswers[surveyId] ?? {};
    const missing = survey.questions.some((question) => !String(answers[question.id] ?? "").trim());
    if (missing) {
      toast.error("Please complete every survey question.");
      return;
    }

    const alreadySubmitted = survey.responses.some((response) => response.memberId === user.memberId);
    if (alreadySubmitted) {
      toast.error("You already completed this survey.");
      return;
    }

    try {
      setSubmittingSurveyId(surveyId);
      await awardMemberPoints({
        memberIdentifier: user.memberId,
        fallbackEmail: user.email,
        points: survey.bonusPoints,
        transactionType: "MANUAL_AWARD",
        reason: `Survey completion (${surveyId}): ${survey.title}`,
      });

      setState((prev) => ({
        ...prev,
        surveys: prev.surveys.map((item) =>
          item.id === surveyId
            ? {
                ...item,
                responses: [
                  ...item.responses,
                  {
                    memberId: user.memberId,
                    memberName: user.fullName,
                    answers,
                    submittedAt: new Date().toISOString(),
                  },
                ],
              }
            : item
        ),
      }));

      setUser((prev) => ({ ...prev, surveysCompleted: prev.surveysCompleted + 1 }));
      await refreshUser();
      toast.success(`Survey submitted. +${survey.bonusPoints} points added.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit survey.");
    } finally {
      setSubmittingSurveyId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Member Engagement</h1>
        <p className="text-gray-500 mt-1">Challenges, social sharing, and surveys.</p>
      </div>

      <div className="overflow-x-auto pb-1">
      <div className="inline-flex min-w-max items-center gap-1 rounded-full bg-[#eef3fb] p-1">
        {engagementTabs.map((tab) => (
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
      <div className="space-y-6">
        <Card className="overflow-hidden border-[#9ed8ff] bg-gradient-to-br from-[#10213a] via-[#153457] to-[#00a3ad] p-6 text-white">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-[#b9f6ff]">Engagement Hub</p>
              <h2 className="mt-3 text-3xl font-bold">Keep members active, visible, and coming back.</h2>
              <p className="mt-2 max-w-2xl text-sm text-[#ddfbff]">
                Track your challenge streaks, share milestone cards, and unlock more value from surveys,
                referrals, and birthday perks.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge className="border border-white/15 bg-white/10 text-white hover:bg-white/10">
                  {activeChallenges.length} live challenges
                </Badge>
                <Badge className="border border-white/15 bg-white/10 text-white hover:bg-white/10">
                  {activeSurveys.length} active surveys
                </Badge>
                <Badge className="border border-white/15 bg-white/10 text-white hover:bg-white/10">
                  {myReferrals.filter((referral) => referral.status === "joined").length} referral joins
                </Badge>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm lg:min-w-[320px]">
              <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                <p className="text-[#b9f6ff]">Surveys done</p>
                <p className="mt-1 text-2xl font-bold">{user.surveysCompleted}</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                <p className="text-[#b9f6ff]">Shares tracked</p>
                <p className="mt-1 text-2xl font-bold">{memberShareEvents.length}</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                <p className="text-[#b9f6ff]">Challenges done</p>
                <p className="mt-1 text-2xl font-bold">{completedChallengesCount}</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                <p className="text-[#b9f6ff]">Birthday perk</p>
                <p className="mt-1 text-base font-bold">{birthdayStatus.hasReward ? "Claimed" : "Ready soon"}</p>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <Card className="border-[#dce9f7] p-5">
              <p className="text-sm font-medium text-gray-500">Referral conversions</p>
              <p className="mt-3 text-3xl font-bold text-[#10213a]">
                {myReferrals.filter((referral) => referral.status === "joined").length}
              </p>
              <p className="mt-2 text-sm text-gray-600">Friends who already joined using your code.</p>
            </Card>
            <Card className="border-[#dce9f7] p-5">
              <p className="text-sm font-medium text-gray-500">Challenge completion</p>
              <p className="mt-3 text-3xl font-bold text-[#10213a]">
                {activeChallenges.length ? Math.round((completedChallengesCount / activeChallenges.length) * 100) : 0}%
              </p>
              <p className="mt-2 text-sm text-gray-600">How much of your live challenge board is already done.</p>
            </Card>
            <Card className="border-[#dce9f7] p-5">
              <p className="text-sm font-medium text-gray-500">Survey momentum</p>
              <p className="mt-3 text-3xl font-bold text-[#10213a]">{activeSurveys.length}</p>
              <p className="mt-2 text-sm text-gray-600">Live feedback opportunities you can answer for bonus points.</p>
            </Card>
          </div>

          <Card className="border-[#dce9f7] bg-[#f8fbff] p-5">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#5f6f86]">Next best move</p>
            {nextChallenge ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-[#10213a]">{nextChallenge.challenge.title}</h3>
                  <Badge className="bg-[#10213a] text-white">{nextChallenge.challenge.rewardPoints} pts</Badge>
                </div>
                <p className="text-sm text-gray-600">{nextChallenge.challenge.description}</p>
                <Progress value={nextChallenge.progress.percent} className="h-2" />
                <p className="text-sm text-[#1A2B47]">
                  {nextChallenge.progress.current}/{nextChallenge.progress.target} {nextChallenge.challenge.unitLabel}
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-[#c8d8eb] bg-white p-4 text-sm text-gray-600">
                No live challenge is available right now. Check the other tabs for surveys and referrals.
              </div>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="p-5">
            <h3 className="text-lg font-semibold text-gray-900">Referral Snapshot</h3>
            <p className="mt-1 text-sm text-gray-500">Bring in friends and grow your point balance faster.</p>
            <div className="mt-4 rounded-2xl bg-[#f7fbff] p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[#5f6f86]">Your code</p>
              <p className="mt-2 text-2xl font-bold text-[#10213a]">{referralCode || "Loading..."}</p>
            </div>
            <p className="mt-4 text-sm text-gray-600">
              {myReferrals.length} tracked referral{myReferrals.length === 1 ? "" : "s"} and{" "}
              {myReferrals.filter((referral) => referral.status === "joined").length} completed join
              {myReferrals.filter((referral) => referral.status === "joined").length === 1 ? "" : "s"}.
            </p>
          </Card>

          <Card className="p-5">
            <h3 className="text-lg font-semibold text-gray-900">Sharing Snapshot</h3>
            <p className="mt-1 text-sm text-gray-500">See how your latest member moment is performing.</p>
            {recentShare ? (
              <div className="mt-4 rounded-2xl border border-gray-200 p-4">
                <p className="font-medium text-[#10213a]">{recentShare.achievement}</p>
                <p className="mt-2 text-sm text-gray-600">
                  Shared on {recentShare.channel} with {recentShare.conversions} conversion
                  {recentShare.conversions === 1 ? "" : "s"}.
                </p>
                <p className="mt-2 text-xs text-gray-500">{new Date(recentShare.createdAt).toLocaleString()}</p>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-gray-200 p-4 text-sm text-gray-600">
                No shares yet. Create your first member moment in the Sharing tab.
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="text-lg font-semibold text-gray-900">Birthday Reward</h3>
            <p className="mt-1 text-sm text-gray-500">A yearly surprise tied to your current tier.</p>
            <div className="mt-4 rounded-2xl bg-[#fff8eb] p-4">
              <p className="text-sm text-[#9a6700]">Current bonus</p>
              <p className="mt-2 text-2xl font-bold text-[#7c4a00]">{getBirthdayRewardPoints(user.tier)} points</p>
              <p className="mt-2 text-sm text-[#9a6700]">
                {birthdayStatus.hasReward ? "Already claimed this year." : "Claimable during your birthday month."}
              </p>
            </div>
          </Card>
        </div>
      </div>
      ) : null}


      {activeTab === "rewards" ? (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="p-6">
          <h2 className="text-xl font-semibold text-gray-900">Referral Program</h2>
          <p className="text-sm text-gray-500 mt-1">Share your code and earn 500 points when friends join. Friends earn 200 points.</p>
          <p className="mt-3 text-sm">Your referral code: <span className="font-bold text-[#10213a]">{referralCode}</span></p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => window.open(`sms:?body=${encodeURIComponent(`Join Central Perk Rewards with my code ${referralCode}: ${referralLink}`)}`, "_self")}
            >
              Share via SMS
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.open(`mailto:?subject=${encodeURIComponent("Join Central Perk Rewards")}&body=${encodeURIComponent(`Use my referral code ${referralCode} and sign up here: ${referralLink}`)}`, "_self")}
            >
              Share via Email
            </Button>
            <Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(referralLink)}>
              Copy QR Link
            </Button>
          </div>
          {referralLink ? (
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(referralLink)}`}
              alt="Referral QR code"
              className="mt-3 h-24 w-24 rounded border border-gray-200"
            />
          ) : null}
          <div className="mt-3 space-y-2">
            <Label htmlFor="referral-email">Friend email</Label>
            <Input id="referral-email" value={referralEmail} onChange={(e) => setReferralEmail(e.target.value)} placeholder="friend@email.com" />
            <Button onClick={handleCreateReferral} className="bg-[#1A2B47] text-white hover:bg-[#152238]">Create Referral</Button>
          </div>
          <p className="mt-4 text-xs text-gray-500">Tracked referrals: {myReferrals.length} • Conversions: {myReferrals.filter((r) => r.status === "joined").length}</p>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold text-gray-900">Birthday Rewards</h2>
          <p className="text-sm text-gray-500 mt-1">Auto-credited on the 1st of your birthday month. Claim once per year.</p>
          <p className="mt-3 text-sm">Current tier bonus: <span className="font-semibold">{getBirthdayRewardPoints(user.tier)} points</span></p>
          <p className="mt-1 text-xs text-gray-500">
            Voucher + birthday badge are included in your month benefits.
            {birthdayStatus.voucherCode ? ` Voucher: ${birthdayStatus.voucherCode}` : ""}
          </p>
          {birthdayStatus.badgeLabel ? <Badge className="mt-2">{birthdayStatus.badgeLabel}</Badge> : null}
          <div className="mt-4 rounded-2xl border border-[#fde68a] bg-[#fffdf4] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9a6700]">Birthday email preview</p>
            <p className="mt-2 font-semibold text-gray-900">Happy birthday, {user.fullName.split(" ")[0] || "member"}.</p>
            <p className="mt-1 text-sm text-gray-600">
              Your {getBirthdayRewardPoints(user.tier)}-point surprise is ready, with your
              {birthdayStatus.voucherCode ? ` voucher ${birthdayStatus.voucherCode}` : " birthday voucher"} and badge included.
            </p>
            <p className="mt-2 text-xs text-gray-500">Subject: Happy Birthday from Central Perk Rewards</p>
          </div>
          <Button onClick={handleBirthdayClaim} className="mt-3 bg-[#00A3AD] text-white hover:bg-[#08939c]" disabled={!isBirthdayMonth(user) || birthdayStatus.hasReward}>
            {birthdayStatus.hasReward ? "Claimed this year" : "Claim Birthday Reward"}
          </Button>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold text-gray-900">Feedback</h2>
          <p className="text-sm text-gray-500 mt-1">Rate your experience and help us improve.</p>
          <div className="mt-3 space-y-2">
            <Label>Category</Label>
            <select className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={feedbackCategory} onChange={(e) => setFeedbackCategory(e.target.value as any)}>
              <option value="points">Points</option><option value="rewards">Rewards</option><option value="service">Service</option><option value="app">App</option>
            </select>
            <Label>Star Rating</Label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-label={`${value} star${value > 1 ? "s" : ""}`}
                  onClick={() => setFeedbackRating(value as 1 | 2 | 3 | 4 | 5)}
                  className={`rounded-xl border px-3 py-2 transition-colors ${
                    feedbackRating >= value
                      ? "border-[#f59e0b] bg-[#fff7ed] text-[#b45309]"
                      : "border-gray-200 bg-white text-gray-400"
                  }`}
                >
                  <Star className={`h-5 w-5 ${feedbackRating >= value ? "fill-current" : ""}`} />
                </button>
              ))}
              <span className="text-sm text-gray-500">{feedbackRating}/5</span>
            </div>
            <Label>Comments</Label>
            <Textarea maxLength={500} value={feedbackComment} onChange={(e) => setFeedbackComment(e.target.value)} placeholder="Share your suggestions (max 500 chars)" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={feedbackContactOptIn} onChange={(e) => setFeedbackContactOptIn(e.target.checked)} /> Contact me for follow-up</label>
            <Label>Optional contact</Label>
            <Input
              value={feedbackContactInfo}
              onChange={(e) => setFeedbackContactInfo(e.target.value)}
              placeholder="Email or phone for follow-up"
            />
            <Button onClick={handleFeedbackSubmit}>Submit Feedback</Button>
          </div>
        </Card>
      </div>
      ) : null}

      {activeTab === "challenges" ? (
      <div className="grid grid-cols-1 gap-6">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#e6f8fa] p-3">
              <Trophy className="h-5 w-5 text-[#0f5f65]" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Active Challenges</h2>
              <p className="text-sm text-gray-500">Track progress, unlock badges, and claim bonus points.</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {state.challenges.map((challenge) => {
              const progress = getChallengeProgress(challenge, user);
              const claimed = claimedChallenges.has(challenge.id);
              return (
                <div key={challenge.id} className="rounded-2xl border border-gray-200 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{challenge.title}</h3>
                        <Badge variant="secondary">{challenge.segment}</Badge>
                        {challenge.competitive ? <Badge className="bg-[#10213a] text-white">Leaderboard</Badge> : null}
                      </div>
                      <p className="mt-1 text-sm text-gray-600">{challenge.description}</p>
                      <p className="mt-1 text-xs font-medium text-[#0f5f65]">
                        Time remaining: {formatTimeRemaining(challenge.endAt)}
                      </p>
                      <p className="mt-2 text-xs text-gray-500">
                        Runs until {new Date(challenge.endAt).toLocaleDateString()} • Reward {challenge.rewardPoints} pts • {challenge.rewardBadge}
                      </p>
                    </div>
                    <div className="rounded-xl bg-[#f8fcff] px-4 py-3 text-right">
                      <p className="text-xs text-gray-500">Progress</p>
                      <p className="text-xl font-bold text-[#10213a]">
                        {progress.current}/{progress.target}
                      </p>
                      <p className="text-xs text-gray-500">{challenge.unitLabel}</p>
                    </div>
                  </div>
                  <Progress className="mt-4 h-2" value={progress.percent} />
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-gray-600">
                      {progress.completed ? "Challenge completed. Reward ready to claim." : "Stay active to finish this challenge on time."}
                    </p>
                    <Button
                      disabled={!progress.completed || claimed || claimingChallengeId === challenge.id}
                      className="bg-[#10213a] text-white hover:bg-[#1b3153]"
                      onClick={() => handleClaimChallenge(challenge.id, challenge.rewardPoints, challenge.title)}
                    >
                      {claimed ? "Reward Claimed" : claimingChallengeId === challenge.id ? "Claiming..." : "Claim Reward"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {competitiveChallenge ? (
            <div className="mt-6 rounded-2xl border border-[#d8e4f4] bg-[#f8fbff] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-900">Member Leaderboard</h3>
                  <p className="text-sm text-gray-500">{competitiveChallenge.title}</p>
                </div>
                <Badge className="bg-[#10213a] text-white">Current member highlighted</Badge>
              </div>
              <div className="mt-4 space-y-3">
                {highlightedLeaderboard.map((entry, index) => {
                  const isCurrentMember = entry.memberId === user.memberId;
                  const rank = challengeLeaderboard.findIndex((row) => row.memberId === entry.memberId) + 1 || index + 1;
                  return (
                    <div
                      key={entry.memberId}
                      className={`rounded-2xl border p-4 ${
                        isCurrentMember ? "border-[#00A3AD] bg-[#e6f8fa]" : "border-gray-200 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ${
                            isCurrentMember ? "bg-[#00A3AD]" : "bg-[#10213a]"
                          }`}>
                            {rank}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">
                              {entry.memberName}
                              {isCurrentMember ? " (You)" : ""}
                            </p>
                            <p className="text-xs text-gray-500">{entry.tier}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-gray-900">{entry.value}</p>
                          <p className="text-xs text-gray-500">{competitiveChallenge.unitLabel}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {highlightedLeaderboard.length === 0 ? (
                  <p className="text-sm text-gray-500">Leaderboard data will appear once challenge activity is recorded.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>
      </div>
      ) : null}

      {activeTab === "sharing" ? (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#f5f0ff] p-3">
              <Share2 className="h-5 w-5 text-[#6d28d9]" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Social Sharing</h2>
              <p className="text-sm text-gray-500">Share tier moments and badges with referral tracking.</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="achievement">Achievement to share</Label>
              <Input id="achievement" value={selectedAchievement} onChange={(event) => setSelectedAchievement(event.target.value)} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="flex items-center gap-2 rounded-xl border border-gray-200 p-3 text-sm">
                <input type="checkbox" checked={privacySettings.showName} onChange={(event) => updatePrivacy({ showName: event.target.checked })} />
                Show name
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-gray-200 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={privacySettings.showReferralCode}
                  onChange={(event) => updatePrivacy({ showReferralCode: event.target.checked })}
                />
                Show referral code
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-gray-200 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={privacySettings.publicProfile}
                  onChange={(event) => updatePrivacy({ publicProfile: event.target.checked })}
                />
                Public profile
              </label>
            </div>

            <div className="rounded-2xl border border-dashed border-[#c8d8eb] bg-white p-4">
              <p className="text-sm font-medium text-[#10213a]">Share text preview</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">{shareMessage}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button className="bg-[#10213a] text-white hover:bg-[#1b3153]" onClick={() => setShareSheetOpen(true)}>
                <Share2 className="mr-2 h-4 w-4" />
                Open Share Sheet
              </Button>
              <Button variant="outline" onClick={() => triggerDownload(sharePreview, `centralperk-${user.memberId}-achievement.svg`)}>
                <Download className="mr-2 h-4 w-4" />
                Download card
              </Button>
            </div>

            <div className="space-y-3">
              {memberShareEvents.slice(0, 3).map((event) => (
                <div key={event.id} className="flex flex-col gap-3 rounded-2xl border border-gray-200 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{event.achievement}</p>
                    <p className="text-sm text-gray-500">
                      {event.channel} • {new Date(event.createdAt).toLocaleString()} • {event.conversions} conversion(s)
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => handleMockConversion(event.id)}>
                    Simulate conversion
                  </Button>
                </div>
              ))}
              {memberShareEvents.length === 0 ? <p className="text-sm text-gray-500">Your tracked shares will appear here.</p> : null}
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden border-[#dce9f7] bg-[#f8fbff] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#5f6f86]">Preview</p>
              <h3 className="mt-2 text-xl font-semibold text-[#10213a]">Share card</h3>
              <p className="mt-1 text-sm text-gray-600">A smaller, cleaner preview of what gets posted or downloaded.</p>
            </div>
            <Badge variant="outline" className="border-[#c8d8eb] bg-white text-[#10213a]">
              {privacySettings.publicProfile ? "Public" : "Private"}
            </Badge>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.16em] text-[#5f6f86]">Tier</p>
              <p className="mt-2 text-lg font-semibold text-[#10213a]">{user.tier}</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.16em] text-[#5f6f86]">Referral</p>
              <p className="mt-2 text-lg font-semibold text-[#10213a]">
                {privacySettings.showReferralCode ? referralCode || "Pending" : "Hidden"}
              </p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.16em] text-[#5f6f86]">Name</p>
              <p className="mt-2 text-lg font-semibold text-[#10213a]">
                {privacySettings.showName ? user.fullName : "Member hidden"}
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-center">
            <div className="w-full max-w-[420px] overflow-hidden rounded-[28px] border border-[#d5e4f2] bg-white shadow-[0_20px_45px_rgba(16,33,58,0.12)]">
              <img src={sharePreview} alt="Share card preview" className="block h-auto w-full object-contain" />
            </div>
          </div>
        </Card>
      </div>
      ) : null}

      <Dialog open={shareSheetOpen} onOpenChange={setShareSheetOpen}>
        <DialogContent className="sm:max-w-xl !bg-white !text-gray-900 border border-gray-200 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Share member moment</DialogTitle>
            <DialogDescription className="text-gray-500">
              Choose a channel and share your achievement with the referral code embedded in the share text.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="rounded-2xl border border-[#dce9f7] bg-[#f8fbff] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5f6f86]">Share text</p>
              <p className="mt-3 text-sm leading-6 text-[#10213a]">{shareMessage}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => handleShare("facebook")}
                className="rounded-2xl border border-[#dce9f7] bg-[#f7fbff] p-5 text-left transition hover:border-[#1877f2] hover:bg-[#eef5ff]"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-[#1877f2] p-3 text-white">
                    <Facebook className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-[#10213a]">Facebook</p>
                    <p className="text-sm text-gray-500">Opens a share window with your referral text.</p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleShare("instagram")}
                className="rounded-2xl border border-[#dce9f7] bg-[#fdf7fb] p-5 text-left transition hover:border-[#d62976] hover:bg-[#fff0f7]"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-[#d62976] p-3 text-white">
                    <Instagram className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-[#10213a]">Instagram</p>
                    <p className="text-sm text-gray-500">Downloads the card for your story or post.</p>
                  </div>
                </div>
              </button>
            </div>

            <div className="rounded-2xl border border-gray-200 p-4">
              <p className="text-sm font-medium text-[#10213a]">Embedded referral details</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-[#f7fbff] p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#5f6f86]">Referral code</p>
                  <p className="mt-2 font-semibold text-[#10213a]">{referralCode || "Pending"}</p>
                </div>
                <div className="rounded-xl bg-[#f7fbff] p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#5f6f86]">Destination</p>
                  <p className="mt-2 break-all text-sm font-medium text-[#10213a]">{referralLink || "Link pending"}</p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-3">
            <Button variant="outline" onClick={() => setShareSheetOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeTab === "surveys" ? (
      <Card className="p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-[#fff7ed] p-3">
            <Award className="h-5 w-5 text-[#c2410c]" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Member Surveys</h2>
            <p className="text-sm text-gray-500">Complete surveys, earn bonus points, and help shape future perks.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {activeSurveys.map((survey) => {
            const alreadySubmitted = survey.responses.some((response) => response.memberId === user.memberId);
            return (
              <div key={survey.id} className="rounded-2xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{survey.title}</h3>
                    <p className="mt-1 text-sm text-gray-600">{survey.description}</p>
                    <p className="mt-2 text-xs text-gray-500">
                      {survey.questions.length} questions • Segment {survey.segment} • Reward {survey.bonusPoints} points
                    </p>
                  </div>
                  <Badge className="bg-[#fff7ed] text-[#c2410c]">{survey.status}</Badge>
                </div>

                <div className="mt-4 space-y-4">
                  {survey.questions.map((question) => (
                    <div key={question.id} className="space-y-2">
                      <Label>{question.prompt}</Label>
                      {question.type === "rating" ? (
                        <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map((value) => (
                            <button
                              key={value}
                              type="button"
                              disabled={alreadySubmitted}
                              onClick={() => handleSurveyAnswerChange(survey.id, question.id, String(value))}
                              className={`h-10 w-10 rounded-lg border text-sm font-semibold ${
                                (surveyAnswers[survey.id]?.[question.id] ?? "") === String(value)
                                  ? "border-[#10213a] bg-[#10213a] text-white"
                                  : "border-gray-200 bg-white text-gray-700"
                              }`}
                            >
                              {value}
                            </button>
                          ))}
                        </div>
                      ) : question.type === "multiple-choice" ? (
                        <div className="grid gap-2">
                          {(question.options ?? []).map((option) => (
                            <label key={option} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                              <input
                                type="radio"
                                name={`${survey.id}-${question.id}`}
                                checked={(surveyAnswers[survey.id]?.[question.id] ?? "") === option}
                                onChange={() => handleSurveyAnswerChange(survey.id, question.id, option)}
                                disabled={alreadySubmitted}
                              />
                              {option}
                            </label>
                          ))}
                        </div>
                      ) : (
                        <Textarea
                          rows={4}
                          disabled={alreadySubmitted}
                          value={surveyAnswers[survey.id]?.[question.id] ?? ""}
                          onChange={(event) => handleSurveyAnswerChange(survey.id, question.id, event.target.value)}
                          placeholder="Share your feedback"
                        />
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-gray-600">
                    {alreadySubmitted ? "Survey already submitted. Thanks for the feedback." : "Submit once to earn your bonus points."}
                  </p>
                  <Button
                    disabled={alreadySubmitted || submittingSurveyId === survey.id}
                    className="bg-[#10213a] text-white hover:bg-[#1b3153]"
                    onClick={() => handleSubmitSurvey(survey.id)}
                  >
                    {alreadySubmitted ? "Completed" : submittingSurveyId === survey.id ? "Submitting..." : `Submit for ${survey.bonusPoints} pts`}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      ) : null}
    </div>
  );
}
