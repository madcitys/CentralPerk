import { supabase } from "../../utils/supabase/client";
import type { MemberData } from "../types/loyalty";
import type { LoyaltyTransaction, Member, MemberLoginActivity } from "../admin-panel/types";

const STORAGE_KEY = "centralperk-member-engagement-v1";

export type EngagementSegment =
  | "All Members"
  | "Bronze"
  | "Silver"
  | "Gold"
  | "High Value"
  | "Inactive 60+ Days";

export type NotificationTrigger =
  | "Points Earned"
  | "Tier Upgrade"
  | "Reward Available"
  | "Flash Sale"
  | "Birthday";

export type SocialChannel = "facebook" | "instagram";

export type QuestionType = "multiple-choice" | "rating" | "free-text";

export type ChallengeType = "purchase-count" | "points-earned" | "survey-completion";

export type WinBackOfferType = "2x Points" | "Special Discount" | "Bonus Reward";

export interface SprintDayPlan {
  day: string;
  focus: string;
  tasks: string[];
}

export interface NotificationTemplate {
  id: string;
  name: string;
  trigger: NotificationTrigger;
  subject: string;
  message: string;
}

export interface NotificationCampaign {
  id: string;
  name: string;
  trigger: NotificationTrigger;
  segment: EngagementSegment;
  scheduledFor: string;
  status: "scheduled" | "live" | "completed";
  audienceSize: number;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  variantA: string;
  variantB: string;
  winner: "A" | "B" | "Pending";
}

export interface ChallengeDefinition {
  id: string;
  title: string;
  description: string;
  type: ChallengeType;
  targetValue: number;
  unitLabel: string;
  startAt: string;
  endAt: string;
  rewardPoints: number;
  rewardBadge: string;
  competitive: boolean;
  segment: EngagementSegment;
}

export interface SurveyQuestion {
  id: string;
  prompt: string;
  type: QuestionType;
  options?: string[];
}

export interface SurveyResponseRecord {
  memberId: string;
  memberName: string;
  answers: Record<string, string | number>;
  submittedAt: string;
}

export interface SurveyDefinition {
  id: string;
  title: string;
  description: string;
  segment: EngagementSegment;
  bonusPoints: number;
  status: "draft" | "live" | "closed";
  createdAt: string;
  questions: SurveyQuestion[];
  responses: SurveyResponseRecord[];
}

export interface SharePrivacySettings {
  showName: boolean;
  showReferralCode: boolean;
  publicProfile: boolean;
}

export interface ShareEvent {
  id: string;
  memberId: string;
  memberName: string;
  tier: string;
  channel: SocialChannel;
  achievement: string;
  referralCode: string;
  conversions: number;
  createdAt: string;
}

export interface WinBackCampaign {
  id: string;
  name: string;
  segment: EngagementSegment;
  offerType: WinBackOfferType;
  offerValue: string;
  status: "scheduled" | "running" | "completed";
  targetedMembers: number;
  responses: number;
  reengagedMembers: number;
  estimatedRevenue: number;
  offerCost: number;
  launchDate: string;
}

export interface EngagementState {
  notificationCampaigns: NotificationCampaign[];
  challenges: ChallengeDefinition[];
  surveys: SurveyDefinition[];
  shareEvents: ShareEvent[];
  winBackCampaigns: WinBackCampaign[];
  claimedChallengeRewardsByMember: Record<string, string[]>;
  privacySettingsByMember: Record<string, SharePrivacySettings>;
}

export interface InactiveMemberInsight {
  memberId: string;
  memberNumber: string;
  memberName: string;
  tier: string;
  daysInactive: number;
  riskLevel: "Low" | "Medium" | "High";
  suggestedOffer: WinBackOfferType;
}

export interface MemberActivityMonitorRow {
  memberId: string;
  memberNumber: string;
  memberName: string;
  tier: string;
  daysSinceLastActivity: number;
  lastActivityDate: string;
  activityStatus: "Inactive" | "At Risk" | "Active";
}

export interface ChallengeProgressSnapshot {
  current: number;
  target: number;
  percent: number;
  completed: boolean;
}

export interface ChallengeLeaderboardEntry {
  memberId: string;
  memberName: string;
  tier: string;
  value: number;
}

type ChallengeRow = {
  id: number | string;
  challenge_code: string;
  challenge_name: string;
  challenge_type: string;
  description?: string | null;
  target_value: number;
  reward_points: number;
  badge_name?: string | null;
  target_segment?: string | null;
  start_date: string;
  end_date: string;
  is_active?: boolean | null;
};

type ChallengeProgressRow = {
  challenge_id: number | string;
  current_value: number;
  target_value: number;
  progress_percent: number;
  is_completed: boolean;
};

type ChallengeLeaderboardRow = {
  challenge_id: number | string;
  member_id: number | string;
  member_name?: string | null;
  member_number?: string | null;
  tier?: string | null;
  current_value: number;
};

type SocialShareEventRow = {
  id: number | string;
  member_id: number | string;
  referral_id?: number | string | null;
  referral_code?: string | null;
  channel: string;
  achievement: string;
  tier_at_share?: string | null;
  badge_label?: string | null;
  share_text?: string | null;
  destination_url?: string | null;
  conversion_count: number;
  last_converted_at?: string | null;
  created_at: string;
};

type ShareEventMemberRow = {
  id: number | string;
  member_id?: string | null;
  member_number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  tier?: string | null;
};

type NotificationTemplateRow = {
  id: string;
  template_name: string;
  trigger_event: string;
  subject: string;
  message: string;
};

type NotificationCampaignRow = {
  id: string;
  campaign_name: string;
  trigger_event: string;
  segment: string;
  scheduled_for: string;
  status: string;
  audience_size: number;
  sent_count: number;
  delivered_count: number;
  opened_count: number;
  variant_a?: string | null;
  variant_b?: string | null;
  winning_variant?: string | null;
};

type SurveyRow = {
  id: string;
  title: string;
  description?: string | null;
  segment: string;
  bonus_points: number;
  status: string;
  created_at: string;
};

type SurveyQuestionRow = {
  id: string;
  survey_id: string;
  prompt: string;
  question_type: string;
  options?: string[] | null;
  display_order: number;
};

type SurveyResponseRow = {
  survey_id: string;
  member_id: number | string;
  submitted_at: string;
  answers: Record<string, string | number>;
};

type WinBackCampaignRow = {
  id: string;
  campaign_name: string;
  segment: string;
  offer_type: string;
  offer_value: string;
  status: string;
  targeted_members: number;
  responses: number;
  reengaged_members: number;
  estimated_revenue: number;
  offer_cost: number;
  launch_date: string;
};

export const developer12SprintPlan: SprintDayPlan[] = [
  {
    day: "Day 1",
    focus: "Notification service and engagement data models",
    tasks: [
      "LYL-036-T1 Integrate push notification service",
      "LYL-037-T1 Design challenge data model",
      "LYL-039-T1 Design survey data model",
      "LYL-040-T1 Implement inactive member detection",
    ],
  },
  {
    day: "Day 2",
    focus: "Message templates, progress logic, and sharing foundation",
    tasks: [
      "LYL-036-T2 Build notification templates",
      "LYL-037-T2 Implement progress tracking",
      "LYL-038-T1 Implement social share API",
      "LYL-040-T2 Create win-back campaign engine",
    ],
  },
  {
    day: "Day 3",
    focus: "Member-facing experiences",
    tasks: [
      "LYL-036-T3 Implement scheduling",
      "LYL-037-T3 Build challenge UI",
      "LYL-038-T2 Generate shareable images",
      "LYL-039-T2 Build survey creator",
    ],
  },
  {
    day: "Day 4",
    focus: "Tracking, leaderboards, and dashboards",
    tasks: [
      "LYL-036-T4 Add delivery tracking",
      "LYL-037-T4 Add leaderboard",
      "LYL-038-T3 Add tracking",
      "LYL-039-T3 Create survey response UI",
      "LYL-040-T3 Build campaign dashboard",
    ],
  },
];

export const notificationTemplates: NotificationTemplate[] = [
  {
    id: "points-earned",
    name: "Points Earned",
    trigger: "Points Earned",
    subject: "You earned new loyalty points",
    message: "Nice work. Fresh points just landed in your account.",
  },
  {
    id: "tier-upgrade",
    name: "Tier Upgrade",
    trigger: "Tier Upgrade",
    subject: "You unlocked a new tier",
    message: "Your loyalty status just moved up. New perks are ready for you.",
  },
  {
    id: "reward-available",
    name: "Reward Available",
    trigger: "Reward Available",
    subject: "A reward is ready to claim",
    message: "Your points can now unlock a featured reward.",
  },
  {
    id: "flash-sale",
    name: "Flash Sale",
    trigger: "Flash Sale",
    subject: "Flash sale for loyalty members",
    message: "Limited-time rewards just dropped. Redeem before the timer runs out.",
  },
  {
    id: "birthday",
    name: "Birthday",
    trigger: "Birthday",
    subject: "Happy birthday from CentralPerk",
    message: "Celebrate with a birthday surprise waiting in your account.",
  },
];

function formatInputDate(value: Date) {
  return `${value.getFullYear()}-${`${value.getMonth() + 1}`.padStart(2, "0")}-${`${value.getDate()}`.padStart(2, "0")}`;
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = (day + 6) % 7;
  next.setDate(next.getDate() - diff);
  next.setHours(0, 0, 0, 0);
  return next;
}

function safeWindow() {
  return typeof window === "undefined" ? null : window;
}

function isMissingRelationError(error: unknown, table: string) {
  const message = String(
    (error as { message?: unknown; details?: unknown; hint?: unknown })?.message ??
      (error as { details?: unknown })?.details ??
      (error as { hint?: unknown })?.hint ??
      ""
  ).toLowerCase();

  return (
    message.includes(`relation "${table.toLowerCase()}" does not exist`) ||
    message.includes(`relation "public.${table.toLowerCase()}" does not exist`) ||
    message.includes(`could not find the table 'public.${table.toLowerCase()}' in the schema cache`) ||
    message.includes(`could not find the table "${table.toLowerCase()}" in the schema cache`) ||
    message.includes(`could not find the table '${table.toLowerCase()}' in the schema cache`) ||
    (message.includes(table.toLowerCase()) && message.includes("schema cache")) ||
    (message.includes(table.toLowerCase()) && message.includes("does not exist"))
  );
}

function normalizeChallengeType(value?: string | null): ChallengeType {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "purchase_count" || raw === "purchase-count") return "purchase-count";
  if (raw === "points_earned" || raw === "points-earned") return "points-earned";
  return "survey-completion";
}

function challengeUnitLabel(type: ChallengeType) {
  if (type === "purchase-count") return "purchases";
  if (type === "points-earned") return "points";
  return "surveys";
}

function normalizeSocialChannel(value?: string | null): SocialChannel {
  return String(value || "").trim().toLowerCase() === "instagram" ? "instagram" : "facebook";
}

function normalizeNotificationTrigger(value?: string | null): NotificationTrigger {
  const raw = String(value || "").trim();
  if (raw === "Points Earned" || raw === "Tier Upgrade" || raw === "Reward Available" || raw === "Flash Sale" || raw === "Birthday") {
    return raw;
  }
  return "Points Earned";
}

function normalizeQuestionType(value?: string | null): QuestionType {
  const raw = String(value || "").trim();
  if (raw === "multiple-choice" || raw === "rating" || raw === "free-text") return raw;
  return "free-text";
}

function normalizeWinBackOfferType(value?: string | null): WinBackOfferType {
  const raw = String(value || "").trim();
  if (raw === "2x Points" || raw === "Special Discount" || raw === "Bonus Reward") return raw;
  return "Bonus Reward";
}

function normalizeEngagementSegment(value?: string | null): EngagementSegment {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "bronze") return "Bronze";
  if (raw === "silver") return "Silver";
  if (raw === "gold") return "Gold";
  if (raw === "high value") return "High Value";
  if (raw === "inactive 60+ days") return "Inactive 60+ Days";
  return "All Members";
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeChallengeRow(row: ChallengeRow): ChallengeDefinition {
  const type = normalizeChallengeType(row.challenge_type);
  return {
    id: String(row.id),
    title: String(row.challenge_name || row.challenge_code || "Challenge"),
    description: String(row.description || ""),
    type,
    targetValue: Math.max(0, Number(row.target_value || 0)),
    unitLabel: challengeUnitLabel(type),
    startAt: String(row.start_date),
    endAt: String(row.end_date),
    rewardPoints: Math.max(0, Number(row.reward_points || 0)),
    rewardBadge: String(row.badge_name || "Challenge Winner"),
    competitive: type === "purchase-count",
    segment: normalizeEngagementSegment(row.target_segment),
  };
}

async function resolveMemberDatabaseId(memberIdentifier: string) {
  const normalized = String(memberIdentifier || "").trim();
  if (!normalized) return null;

  const isNumericIdentifier = /^\d+$/.test(normalized);
  let query = supabase
    .from("loyalty_members")
    .select("id,member_id,member_number")
    .limit(1);

  if (isNumericIdentifier) {
    query = query.or(`member_number.eq.${normalized},member_id.eq.${normalized},id.eq.${normalized}`);
  } else {
    query = query.eq("member_number", normalized);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return data?.id ? String(data.id) : null;
}

function formatShareEventMemberName(member?: ShareEventMemberRow | null, fallbackMemberId?: number | string) {
  const fullName = `${member?.first_name || ""} ${member?.last_name || ""}`.trim();
  if (fullName) return fullName;
  if (member?.member_number) return member.member_number;
  const fallback = String(member?.member_id || fallbackMemberId || "").trim();
  return fallback ? `Member ${fallback}` : "Member";
}

function buildDefaultState(): EngagementState {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    notificationCampaigns: [
      {
        id: "notif-1",
        name: "Weekend Double Points",
        trigger: "Flash Sale",
        segment: "Gold",
        scheduledFor: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        status: "scheduled",
        audienceSize: 128,
        sentCount: 0,
        deliveredCount: 0,
        openedCount: 0,
        variantA: "Double points starts at 6 PM. Swipe in early.",
        variantB: "Gold members get first access to double points tonight.",
        winner: "Pending",
      },
      {
        id: "notif-2",
        name: "Reward Ready Reminder",
        trigger: "Reward Available",
        segment: "High Value",
        scheduledFor: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        status: "completed",
        audienceSize: 84,
        sentCount: 84,
        deliveredCount: 80,
        openedCount: 41,
        variantA: "A featured reward is ready in your account.",
        variantB: "You have enough points for this week’s featured reward.",
        winner: "B",
      },
    ],
    challenges: [
      {
        id: "challenge-1",
        title: "Make 3 purchases this week",
        description: "Complete three purchases before the week ends to unlock a bonus.",
        type: "purchase-count",
        targetValue: 3,
        unitLabel: "purchases",
        startAt: weekStart.toISOString(),
        endAt: new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString(),
        rewardPoints: 150,
        rewardBadge: "Weekly Streak",
        competitive: true,
        segment: "All Members",
      },
      {
        id: "challenge-2",
        title: "Earn 1000 points this month",
        description: "Stay active and reach one thousand earned points before month-end.",
        type: "points-earned",
        targetValue: 1000,
        unitLabel: "points",
        startAt: monthStart.toISOString(),
        endAt: monthEnd.toISOString(),
        rewardPoints: 250,
        rewardBadge: "Momentum Builder",
        competitive: false,
        segment: "All Members",
      },
      {
        id: "challenge-3",
        title: "Complete 2 surveys this month",
        description: "Share feedback twice this month to earn extra loyalty points.",
        type: "survey-completion",
        targetValue: 2,
        unitLabel: "surveys",
        startAt: monthStart.toISOString(),
        endAt: monthEnd.toISOString(),
        rewardPoints: 100,
        rewardBadge: "Voice of the Member",
        competitive: false,
        segment: "Silver",
      },
    ],
    surveys: [
      {
        id: "survey-1",
        title: "March Experience Pulse",
        description: "Help us improve rewards, notifications, and member-exclusive offers.",
        segment: "All Members",
        bonusPoints: 50,
        status: "live",
        createdAt: now.toISOString(),
        questions: [
          {
            id: "q1",
            prompt: "How satisfied are you with your rewards experience this month?",
            type: "rating",
          },
          {
            id: "q2",
            prompt: "Which perk motivates you most right now?",
            type: "multiple-choice",
            options: ["Bonus points", "Tier upgrades", "Flash sales", "Member challenges"],
          },
          {
            id: "q3",
            prompt: "What should we improve next?",
            type: "free-text",
          },
        ],
        responses: [],
      },
    ],
    shareEvents: [],
    winBackCampaigns: [
      {
        id: "winback-1",
        name: "Inactive Gold Rescue",
        segment: "Inactive 60+ Days",
        offerType: "2x Points",
        offerValue: "2x points on the next purchase",
        status: "running",
        targetedMembers: 42,
        responses: 14,
        reengagedMembers: 8,
        estimatedRevenue: 18600,
        offerCost: 4300,
        launchDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    claimedChallengeRewardsByMember: {},
    privacySettingsByMember: {},
  };
}

export function loadEngagementState(): EngagementState {
  const browser = safeWindow();
  if (!browser) return buildDefaultState();

  try {
    const raw = browser.localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildDefaultState();

    const parsed = JSON.parse(raw) as Partial<EngagementState>;
    const defaults = buildDefaultState();
    const preferNonEmptyArray = <T,>(candidate: T[] | undefined, fallback: T[]) =>
      candidate && candidate.length > 0 ? candidate : fallback;
    return {
      ...defaults,
      ...parsed,
      notificationCampaigns: preferNonEmptyArray(parsed.notificationCampaigns, defaults.notificationCampaigns),
      // Always rebuild challenges from current defaults/DB to avoid stale ended dates
      // lingering in localStorage across months.
      challenges: defaults.challenges,
      surveys: preferNonEmptyArray(parsed.surveys, defaults.surveys),
      shareEvents: defaults.shareEvents,
      winBackCampaigns: preferNonEmptyArray(parsed.winBackCampaigns, defaults.winBackCampaigns),
      claimedChallengeRewardsByMember: parsed.claimedChallengeRewardsByMember ?? {},
      privacySettingsByMember: parsed.privacySettingsByMember ?? {},
    };
  } catch {
    return buildDefaultState();
  }
}

export function saveEngagementState(state: EngagementState) {
  const browser = safeWindow();
  if (!browser) return;
  browser.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function loadChallengeDefinitions() {
  const { data, error } = await supabase
    .from("challenges")
    .select("id,challenge_code,challenge_name,challenge_type,description,target_value,reward_points,badge_name,target_segment,start_date,end_date,is_active")
    .eq("is_active", true)
    .order("start_date", { ascending: true });

  if (error) {
    if (isMissingRelationError(error, "challenges")) return [];
    throw error;
  }

  return ((data || []) as ChallengeRow[]).map(normalizeChallengeRow);
}

export async function loadChallengeProgressByMember(memberIdentifier: string) {
  const memberId = await resolveMemberDatabaseId(memberIdentifier);
  if (!memberId) return new Map<string, ChallengeProgressSnapshot>();

  const { data, error } = await supabase
    .from("member_challenge_progress")
    .select("challenge_id,current_value,target_value,progress_percent,is_completed")
    .eq("member_id", memberId);

  if (error) {
    if (isMissingRelationError(error, "member_challenge_progress")) return new Map<string, ChallengeProgressSnapshot>();
    throw error;
  }

  return new Map(
    ((data || []) as ChallengeProgressRow[]).map((row) => [
      String(row.challenge_id),
      {
        current: Math.max(0, Number(row.current_value || 0)),
        target: Math.max(0, Number(row.target_value || 0)),
        percent: Math.max(0, Math.min(100, Number(row.progress_percent || 0))),
        completed: Boolean(row.is_completed),
      } satisfies ChallengeProgressSnapshot,
    ])
  );
}

export async function loadChallengeLeaderboard(challengeId: string) {
  const { data, error } = await supabase
    .from("challenge_leaderboard_view")
    .select("challenge_id,member_id,member_name,member_number,tier,current_value,leaderboard_rank")
    .eq("challenge_id", challengeId)
    .order("leaderboard_rank", { ascending: true })
    .limit(10);

  if (error) {
    if (isMissingRelationError(error, "challenge_leaderboard_view")) return [];
    throw error;
  }

  return ((data || []) as ChallengeLeaderboardRow[]).map((row) => ({
    memberId: String(row.member_id ?? row.member_number ?? ""),
    memberName: String(row.member_name || row.member_number || "Member"),
    tier: String(row.tier || "Bronze"),
    value: Math.max(0, Number(row.current_value || 0)),
  }));
}

export async function loadSocialShareEvents(options?: { memberIdentifier?: string }) {
  let memberId: string | null = null;
  if (options?.memberIdentifier) {
    memberId = await resolveMemberDatabaseId(options.memberIdentifier);
    if (!memberId) return [];
  }

  let query = supabase
    .from("social_share_events")
    .select("id,member_id,referral_id,referral_code,channel,achievement,tier_at_share,badge_label,share_text,destination_url,conversion_count,last_converted_at,created_at")
    .order("created_at", { ascending: false });

  if (memberId) {
    query = query.eq("member_id", memberId);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingRelationError(error, "social_share_events")) return [];
    throw error;
  }

  const rows = (data || []) as SocialShareEventRow[];
  if (rows.length === 0) return [];

  const memberIds = [...new Set(rows.map((row) => String(row.member_id)).filter(Boolean))];
  const { data: memberRows, error: memberError } = await supabase
    .from("loyalty_members")
    .select("id,member_id,member_number,first_name,last_name,tier")
    .in("id", memberIds);

  if (memberError) throw memberError;

  const memberMap = new Map(
    ((memberRows || []) as ShareEventMemberRow[]).map((row) => [String(row.id), row])
  );

  return rows.map((row) => {
    const member = memberMap.get(String(row.member_id));
    return {
      id: String(row.id),
      memberId: String(member?.member_id || row.member_id),
      memberName: formatShareEventMemberName(member, row.member_id),
      tier: String(row.tier_at_share || member?.tier || "Bronze"),
      channel: normalizeSocialChannel(row.channel),
      achievement: String(row.achievement || "Shared achievement"),
      referralCode: String(row.referral_code || ""),
      conversions: Math.max(0, Number(row.conversion_count || 0)),
      createdAt: String(row.created_at),
    } satisfies ShareEvent;
  });
}

export async function recordSocialShareEvent(input: {
  memberIdentifier: string;
  memberName: string;
  tier: string;
  channel: SocialChannel;
  achievement: string;
  referralCode?: string;
  badgeLabel?: string;
  shareText?: string;
  destinationUrl?: string;
}) {
  const memberId = await resolveMemberDatabaseId(input.memberIdentifier);
  if (!memberId) throw new Error("Unable to resolve the sharing member.");

  let referralId: string | null = null;
  if (input.referralCode) {
    const { data: referralRow } = await supabase
      .from("member_referrals")
      .select("id")
      .eq("referrer_member_id", memberId)
      .eq("referrer_code", input.referralCode)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    referralId = referralRow?.id ? String(referralRow.id) : null;
  }

  const { data, error } = await supabase
    .from("social_share_events")
    .insert({
      member_id: memberId,
      referral_id: referralId,
      referral_code: input.referralCode || null,
      channel: input.channel,
      achievement: input.achievement,
      tier_at_share: input.tier,
      badge_label: input.badgeLabel || null,
      share_text: input.shareText || null,
      destination_url: input.destinationUrl || null,
    })
    .select("id,member_id,referral_code,channel,achievement,tier_at_share,conversion_count,created_at")
    .single();

  if (error) {
    if (isMissingRelationError(error, "social_share_events")) return null;
    throw error;
  }

  const row = data as SocialShareEventRow;
  return {
    id: String(row.id),
    memberId: input.memberIdentifier,
    memberName: input.memberName,
    tier: input.tier,
    channel: normalizeSocialChannel(row.channel),
    achievement: input.achievement,
    referralCode: String(row.referral_code || input.referralCode || ""),
    conversions: Math.max(0, Number(row.conversion_count || 0)),
    createdAt: String(row.created_at),
  } satisfies ShareEvent;
}

export async function incrementSocialShareConversion(shareEventId: string) {
  const numericId = Number(shareEventId);
  if (!Number.isFinite(numericId)) return null;

  const { data: existing, error: existingError } = await supabase
    .from("social_share_events")
    .select("conversion_count")
    .eq("id", numericId)
    .maybeSingle();

  if (existingError) {
    if (isMissingRelationError(existingError, "social_share_events")) return null;
    throw existingError;
  }

  if (!existing) return null;

  const nextCount = Math.max(0, Number(existing.conversion_count || 0)) + 1;
  const { data, error } = await supabase
    .from("social_share_events")
    .update({
      conversion_count: nextCount,
      last_converted_at: new Date().toISOString(),
    })
    .eq("id", numericId)
    .select("id,member_id,referral_code,channel,achievement,tier_at_share,conversion_count,created_at")
    .single();

  if (error) throw error;

  const row = data as SocialShareEventRow;
  return {
    id: String(row.id),
    memberId: String(row.member_id),
    memberName: "",
    tier: String(row.tier_at_share || "Bronze"),
    channel: normalizeSocialChannel(row.channel),
    achievement: String(row.achievement || "Shared achievement"),
    referralCode: String(row.referral_code || ""),
    conversions: Math.max(0, Number(row.conversion_count || 0)),
    createdAt: String(row.created_at),
  } satisfies ShareEvent;
}

export async function loadNotificationTemplates() {
  const { data, error } = await supabase
    .from("notification_templates")
    .select("id,template_name,trigger_event,subject,message")
    .eq("is_active", true)
    .order("template_name", { ascending: true });

  if (error) {
    if (isMissingRelationError(error, "notification_templates")) return [];
    throw error;
  }

  return ((data || []) as NotificationTemplateRow[]).map((row) => ({
    id: row.id,
    name: String(row.template_name || "Template"),
    trigger: normalizeNotificationTrigger(row.trigger_event),
    subject: String(row.subject || ""),
    message: String(row.message || ""),
  } satisfies NotificationTemplate));
}

export async function loadNotificationCampaigns() {
  const { data, error } = await supabase
    .from("notification_campaigns")
    .select("id,campaign_name,trigger_event,segment,scheduled_for,status,audience_size,sent_count,delivered_count,opened_count,variant_a,variant_b,winning_variant")
    .order("scheduled_for", { ascending: false });

  if (error) {
    if (isMissingRelationError(error, "notification_campaigns")) return [];
    throw error;
  }

  return ((data || []) as NotificationCampaignRow[]).map((row) => ({
    id: row.id,
    name: String(row.campaign_name || "Campaign"),
    trigger: normalizeNotificationTrigger(row.trigger_event),
    segment: normalizeEngagementSegment(row.segment),
    scheduledFor: String(row.scheduled_for),
    status: row.status === "live" || row.status === "completed" ? row.status : "scheduled",
    audienceSize: Math.max(0, Number(row.audience_size || 0)),
    sentCount: Math.max(0, Number(row.sent_count || 0)),
    deliveredCount: Math.max(0, Number(row.delivered_count || 0)),
    openedCount: Math.max(0, Number(row.opened_count || 0)),
    variantA: String(row.variant_a || ""),
    variantB: String(row.variant_b || ""),
    winner: row.winning_variant === "A" || row.winning_variant === "B" ? row.winning_variant : "Pending",
  } satisfies NotificationCampaign));
}

export async function createNotificationCampaignRecord(input: {
  name: string;
  trigger: NotificationTrigger;
  segment: EngagementSegment;
  scheduledFor: string;
  audienceSize: number;
  variantA: string;
  variantB: string;
}) {
  const campaignCode = `NC-${Date.now()}`;
  const { data, error } = await supabase
    .from("notification_campaigns")
    .insert({
      campaign_code: campaignCode,
      campaign_name: input.name,
      trigger_event: input.trigger,
      segment: input.segment,
      scheduled_for: input.scheduledFor,
      audience_size: input.audienceSize,
      variant_a: input.variantA,
      variant_b: input.variantB,
    })
    .select("id,campaign_name,trigger_event,segment,scheduled_for,status,audience_size,sent_count,delivered_count,opened_count,variant_a,variant_b,winning_variant")
    .single();

  if (error) {
    if (isMissingRelationError(error, "notification_campaigns")) return null;
    throw error;
  }

  const row = data as NotificationCampaignRow;
  return {
    id: row.id,
    name: String(row.campaign_name),
    trigger: normalizeNotificationTrigger(row.trigger_event),
    segment: normalizeEngagementSegment(row.segment),
    scheduledFor: String(row.scheduled_for),
    status: row.status === "live" || row.status === "completed" ? row.status : "scheduled",
    audienceSize: Math.max(0, Number(row.audience_size || 0)),
    sentCount: Math.max(0, Number(row.sent_count || 0)),
    deliveredCount: Math.max(0, Number(row.delivered_count || 0)),
    openedCount: Math.max(0, Number(row.opened_count || 0)),
    variantA: String(row.variant_a || ""),
    variantB: String(row.variant_b || ""),
    winner: row.winning_variant === "A" || row.winning_variant === "B" ? row.winning_variant : "Pending",
  } satisfies NotificationCampaign;
}

export async function launchNotificationCampaignRecord(campaignId: string, patch: {
  status: "completed";
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  winner: "A" | "B";
}) {
  const { data, error } = await supabase
    .from("notification_campaigns")
    .update({
      status: patch.status,
      sent_count: patch.sentCount,
      delivered_count: patch.deliveredCount,
      opened_count: patch.openedCount,
      winning_variant: patch.winner,
    })
    .eq("id", campaignId)
    .select("id,campaign_name,trigger_event,segment,scheduled_for,status,audience_size,sent_count,delivered_count,opened_count,variant_a,variant_b,winning_variant")
    .single();

  if (error) {
    if (isMissingRelationError(error, "notification_campaigns")) return null;
    throw error;
  }

  const row = data as NotificationCampaignRow;
  return {
    id: row.id,
    name: String(row.campaign_name || "Campaign"),
    trigger: normalizeNotificationTrigger(row.trigger_event),
    segment: normalizeEngagementSegment(row.segment),
    scheduledFor: String(row.scheduled_for),
    status: row.status === "completed" ? "completed" : "scheduled",
    audienceSize: Math.max(0, Number(row.audience_size || 0)),
    sentCount: Math.max(0, Number(row.sent_count || 0)),
    deliveredCount: Math.max(0, Number(row.delivered_count || 0)),
    openedCount: Math.max(0, Number(row.opened_count || 0)),
    variantA: String(row.variant_a || ""),
    variantB: String(row.variant_b || ""),
    winner: row.winning_variant === "A" || row.winning_variant === "B" ? row.winning_variant : "Pending",
  } satisfies NotificationCampaign;
}

export async function loadSurveyDefinitions() {
  const { data: surveyData, error: surveyError } = await supabase
    .from("surveys")
    .select("id,title,description,segment,bonus_points,status,created_at")
    .order("created_at", { ascending: false });

  if (surveyError) {
    if (isMissingRelationError(surveyError, "surveys")) return [];
    throw surveyError;
  }

  const surveys = (surveyData || []) as SurveyRow[];
  if (surveys.length === 0) return [];

  const surveyIds = surveys.map((survey) => survey.id);
  const [{ data: questionData, error: questionError }, { data: responseData, error: responseError }] = await Promise.all([
    supabase
      .from("survey_questions")
      .select("id,survey_id,prompt,question_type,options,display_order")
      .in("survey_id", surveyIds)
      .order("display_order", { ascending: true }),
    supabase
      .from("survey_responses")
      .select("survey_id,member_id,submitted_at,answers")
      .in("survey_id", surveyIds)
      .order("submitted_at", { ascending: false }),
  ]);

  if (questionError) throw questionError;
  if (responseError) throw responseError;

  const responseRows = (responseData || []) as SurveyResponseRow[];
  const responseMemberIds = [...new Set(responseRows.map((row) => String(row.member_id)).filter(Boolean))];
  const { data: responseMembers, error: responseMembersError } = responseMemberIds.length
    ? await supabase
        .from("loyalty_members")
        .select("id,member_id,member_number,first_name,last_name")
        .in("id", responseMemberIds)
    : { data: [], error: null };

  if (responseMembersError) throw responseMembersError;

  const memberMap = new Map(
    ((responseMembers || []) as ShareEventMemberRow[]).map((row) => [String(row.id), row])
  );
  const questionMap = new Map<string, SurveyQuestion[]>();
  ((questionData || []) as SurveyQuestionRow[]).forEach((row) => {
    const list = questionMap.get(row.survey_id) ?? [];
    list.push({
      id: row.id,
      prompt: String(row.prompt || ""),
      type: normalizeQuestionType(row.question_type),
      options: Array.isArray(row.options) ? row.options.map((item) => String(item)) : undefined,
    });
    questionMap.set(row.survey_id, list);
  });

  const responseMap = new Map<string, SurveyResponseRecord[]>();
  responseRows.forEach((row) => {
    const member = memberMap.get(String(row.member_id));
    const list = responseMap.get(row.survey_id) ?? [];
    list.push({
      memberId: String(member?.member_id || row.member_id),
      memberName: formatShareEventMemberName(member, row.member_id),
      answers: row.answers || {},
      submittedAt: String(row.submitted_at),
    });
    responseMap.set(row.survey_id, list);
  });

  return surveys.map((survey) => ({
    id: survey.id,
    title: String(survey.title || "Survey"),
    description: String(survey.description || ""),
    segment: normalizeEngagementSegment(survey.segment),
    bonusPoints: Math.max(0, Number(survey.bonus_points || 0)),
    status: survey.status === "live" || survey.status === "closed" ? survey.status : "draft",
    createdAt: String(survey.created_at),
    questions: questionMap.get(survey.id) ?? [],
    responses: responseMap.get(survey.id) ?? [],
  } satisfies SurveyDefinition));
}

export async function createSurveyDefinitionRecord(input: {
  title: string;
  description: string;
  segment: EngagementSegment;
  bonusPoints: number;
  status: "draft" | "live" | "closed";
  questions: SurveyQuestion[];
}) {
  const surveyCode = `SV-${Date.now()}`;
  const { data: surveyData, error: surveyError } = await supabase
    .from("surveys")
    .insert({
      survey_code: surveyCode,
      title: input.title,
      description: input.description,
      segment: input.segment,
      bonus_points: input.bonusPoints,
      status: input.status,
    })
    .select("id,title,description,segment,bonus_points,status,created_at")
    .single();

  if (surveyError) {
    if (isMissingRelationError(surveyError, "surveys")) return null;
    throw surveyError;
  }

  const survey = surveyData as SurveyRow;
  if (input.questions.length > 0) {
    const { error: questionInsertError } = await supabase.from("survey_questions").insert(
      input.questions.map((question, index) => ({
        survey_id: survey.id,
        question_code: `Q-${index + 1}`,
        prompt: question.prompt,
        question_type: question.type,
        options: question.options ?? [],
        display_order: index + 1,
      }))
    );

    if (questionInsertError) throw questionInsertError;
  }

  return {
    id: survey.id,
    title: String(survey.title || input.title),
    description: String(survey.description || input.description),
    segment: normalizeEngagementSegment(survey.segment),
    bonusPoints: Math.max(0, Number(survey.bonus_points || input.bonusPoints)),
    status: survey.status === "live" || survey.status === "closed" ? survey.status : "draft",
    createdAt: String(survey.created_at),
    questions: input.questions,
    responses: [],
  } satisfies SurveyDefinition;
}

export async function submitSurveyResponseRecord(input: {
  surveyId: string;
  memberIdentifier: string;
  answers: Record<string, string | number>;
  bonusPoints: number;
}) {
  if (!isUuidLike(input.surveyId)) return null;

  const memberId = await resolveMemberDatabaseId(input.memberIdentifier);
  if (!memberId) throw new Error("Unable to resolve the survey member.");

  const { data, error } = await supabase
    .from("survey_responses")
    .insert({
      survey_id: input.surveyId,
      member_id: memberId,
      answers: input.answers,
      bonus_points_awarded: input.bonusPoints,
    })
    .select("survey_id,member_id,submitted_at,answers")
    .single();

  if (error) {
    if (isMissingRelationError(error, "survey_responses")) return null;
    throw error;
  }

  const { data: memberData, error: memberError } = await supabase
    .from("loyalty_members")
    .select("id,member_id,member_number,first_name,last_name")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError) throw memberError;

  const row = data as SurveyResponseRow;
  const member = (memberData || null) as ShareEventMemberRow | null;
  return {
    memberId: String(member?.member_id || row.member_id),
    memberName: formatShareEventMemberName(member, row.member_id),
    answers: row.answers || {},
    submittedAt: String(row.submitted_at),
  } satisfies SurveyResponseRecord;
}

export async function deleteSurveyResponseRecord(surveyId: string, memberIdentifier: string) {
  if (!isUuidLike(surveyId)) return;

  const memberId = await resolveMemberDatabaseId(memberIdentifier);
  if (!memberId) return;

  const { error } = await supabase
    .from("survey_responses")
    .delete()
    .eq("survey_id", surveyId)
    .eq("member_id", memberId);

  if (error) {
    if (isMissingRelationError(error, "survey_responses")) return;
    throw error;
  }
}

export async function loadWinBackCampaigns() {
  const { data, error } = await supabase
    .from("winback_campaigns")
    .select("id,campaign_name,segment,offer_type,offer_value,status,targeted_members,responses,reengaged_members,estimated_revenue,offer_cost,launch_date")
    .order("launch_date", { ascending: false });

  if (error) {
    if (isMissingRelationError(error, "winback_campaigns")) return [];
    throw error;
  }

  return ((data || []) as WinBackCampaignRow[]).map((row) => ({
    id: row.id,
    name: String(row.campaign_name || "Win-back campaign"),
    segment: normalizeEngagementSegment(row.segment),
    offerType: normalizeWinBackOfferType(row.offer_type),
    offerValue: String(row.offer_value || ""),
    status: row.status === "running" || row.status === "completed" ? row.status : "scheduled",
    targetedMembers: Math.max(0, Number(row.targeted_members || 0)),
    responses: Math.max(0, Number(row.responses || 0)),
    reengagedMembers: Math.max(0, Number(row.reengaged_members || 0)),
    estimatedRevenue: Math.max(0, Number(row.estimated_revenue || 0)),
    offerCost: Math.max(0, Number(row.offer_cost || 0)),
    launchDate: String(row.launch_date),
  } satisfies WinBackCampaign));
}

export async function createWinBackCampaignRecord(input: {
  name: string;
  segment: EngagementSegment;
  offerType: WinBackOfferType;
  offerValue: string;
  targetedMembers: number;
  responses: number;
  reengagedMembers: number;
  estimatedRevenue: number;
  offerCost: number;
  status: "scheduled" | "running" | "completed";
}) {
  const campaignCode = `WB-${Date.now()}`;
  const { data, error } = await supabase
    .from("winback_campaigns")
    .insert({
      campaign_code: campaignCode,
      campaign_name: input.name,
      segment: input.segment,
      offer_type: input.offerType,
      offer_value: input.offerValue,
      status: input.status,
      targeted_members: input.targetedMembers,
      responses: input.responses,
      reengaged_members: input.reengagedMembers,
      estimated_revenue: input.estimatedRevenue,
      offer_cost: input.offerCost,
      launch_date: new Date().toISOString(),
    })
    .select("id,campaign_name,segment,offer_type,offer_value,status,targeted_members,responses,reengaged_members,estimated_revenue,offer_cost,launch_date")
    .single();

  if (error) {
    if (isMissingRelationError(error, "winback_campaigns")) return null;
    throw error;
  }

  const row = data as WinBackCampaignRow;
  return {
    id: row.id,
    name: String(row.campaign_name || input.name),
    segment: normalizeEngagementSegment(row.segment),
    offerType: normalizeWinBackOfferType(row.offer_type),
    offerValue: String(row.offer_value || input.offerValue),
    status: row.status === "running" || row.status === "completed" ? row.status : "scheduled",
    targetedMembers: Math.max(0, Number(row.targeted_members || 0)),
    responses: Math.max(0, Number(row.responses || 0)),
    reengagedMembers: Math.max(0, Number(row.reengaged_members || 0)),
    estimatedRevenue: Math.max(0, Number(row.estimated_revenue || 0)),
    offerCost: Math.max(0, Number(row.offer_cost || 0)),
    launchDate: String(row.launch_date),
  } satisfies WinBackCampaign;
}

export function getMemberPrivacySettings(state: EngagementState, memberId: string): SharePrivacySettings {
  return (
    state.privacySettingsByMember[memberId] ?? {
      showName: true,
      showReferralCode: true,
      publicProfile: true,
    }
  );
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function latestActivityDate(memberId: string, transactions: LoyaltyTransaction[], loginActivity: MemberLoginActivity[]) {
  const txDates = transactions
    .filter((item) => String(item.member_id) === memberId)
    .map((item) => parseDate(item.transaction_date))
    .filter((item): item is Date => Boolean(item));

  const loginDates = loginActivity
    .filter((item) => String(item.member_id) === memberId)
    .map((item) => parseDate(item.login_at))
    .filter((item): item is Date => Boolean(item));

  const allDates = [...txDates, ...loginDates];
  if (allDates.length === 0) return null;
  return new Date(Math.max(...allDates.map((item) => item.getTime())));
}

export function buildInactiveMemberInsights(
  members: Member[],
  transactions: LoyaltyTransaction[],
  loginActivity: MemberLoginActivity[]
): InactiveMemberInsight[] {
  const now = Date.now();

  return members
    .map((member) => {
      const memberId = String(member.member_id ?? member.id ?? "");
      const lastSeen = latestActivityDate(memberId, transactions, loginActivity);
      const enrollment = parseDate(member.enrollment_date);
      const baseDate = lastSeen ?? enrollment;
      if (!baseDate) return null;

      const daysInactive = Math.max(0, Math.floor((now - baseDate.getTime()) / (1000 * 60 * 60 * 24)));
      if (daysInactive < 60) return null;

      const tier = String(member.tier || "Bronze");
      const riskLevel: InactiveMemberInsight["riskLevel"] =
        daysInactive >= 120 ? "High" : daysInactive >= 90 ? "Medium" : "Low";
      const suggestedOffer: WinBackOfferType =
        tier.toLowerCase() === "gold" ? "2x Points" : tier.toLowerCase() === "silver" ? "Bonus Reward" : "Special Discount";

      return {
        memberId,
        memberNumber: member.member_number,
        memberName: `${member.first_name} ${member.last_name}`.trim(),
        tier,
        daysInactive,
        riskLevel,
        suggestedOffer,
      };
    })
    .filter((item): item is InactiveMemberInsight => Boolean(item))
    .sort((a, b) => b.daysInactive - a.daysInactive);
}

export function buildMemberActivityMonitor(
  members: Member[],
  transactions: LoyaltyTransaction[],
  loginActivity: MemberLoginActivity[]
): MemberActivityMonitorRow[] {
  const now = Date.now();
  const rows: MemberActivityMonitorRow[] = [];

  members.forEach((member) => {
      const memberId = String(member.member_id ?? member.id ?? "");
      const lastSeen = latestActivityDate(memberId, transactions, loginActivity);
      const enrollment = parseDate(member.enrollment_date);
      const baseDate = lastSeen ?? enrollment;
      if (!baseDate) return;

      const daysSinceLastActivity = Math.max(0, Math.floor((now - baseDate.getTime()) / (1000 * 60 * 60 * 24)));
      const activityStatus: MemberActivityMonitorRow["activityStatus"] =
        daysSinceLastActivity >= 60 ? "Inactive" : daysSinceLastActivity >= 30 ? "At Risk" : "Active";

      rows.push({
        memberId,
        memberNumber: member.member_number,
        memberName: `${member.first_name} ${member.last_name}`.trim(),
        tier: String(member.tier || "Bronze"),
        daysSinceLastActivity,
        lastActivityDate: baseDate.toISOString(),
        activityStatus,
      });
    });

  return rows.sort((a, b) => b.daysSinceLastActivity - a.daysSinceLastActivity);
}

function isDateInRange(date: Date, start: Date, end: Date) {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

export function getChallengeProgress(challenge: ChallengeDefinition, user: MemberData): ChallengeProgressSnapshot {
  const start = parseDate(challenge.startAt) ?? new Date(0);
  const end = parseDate(challenge.endAt) ?? new Date();
  let current = 0;

  if (challenge.type === "purchase-count") {
    current = user.transactions.filter((tx) => {
      const txDate = parseDate(tx.date);
      return Boolean(txDate) && tx.type === "earned" && Boolean(tx.receiptId) && isDateInRange(txDate!, start, end);
    }).length;
  }

  if (challenge.type === "points-earned") {
    current = user.transactions
      .filter((tx) => {
        const txDate = parseDate(tx.date);
        return Boolean(txDate) && tx.type === "earned" && isDateInRange(txDate!, start, end);
      })
      .reduce((sum, tx) => sum + Math.abs(Number(tx.points || 0)), 0);
  }

  if (challenge.type === "survey-completion") {
    current = Math.max(0, Number(user.surveysCompleted || 0));
  }

  return {
    current,
    target: challenge.targetValue,
    percent: Math.min(100, challenge.targetValue > 0 ? (current / challenge.targetValue) * 100 : 0),
    completed: current >= challenge.targetValue,
  };
}

export function getChallengeLeaderboard(challenge: ChallengeDefinition, members: Member[], transactions: LoyaltyTransaction[]) {
  const start = parseDate(challenge.startAt) ?? new Date(0);
  const end = parseDate(challenge.endAt) ?? new Date();

  const rows = members.map((member) => {
    const memberId = String(member.member_id ?? member.id ?? "");
    let value = 0;

    if (challenge.type === "purchase-count") {
      value = transactions.filter((tx) => {
        const txDate = parseDate(tx.transaction_date);
        return (
          String(tx.member_id) === memberId &&
          tx.transaction_type.toUpperCase() === "PURCHASE" &&
          Boolean(txDate) &&
          isDateInRange(txDate!, start, end)
        );
      }).length;
    }

    if (challenge.type === "points-earned") {
      value = transactions
        .filter((tx) => {
          const txDate = parseDate(tx.transaction_date);
          const upperType = tx.transaction_type.toUpperCase();
          return (
            String(tx.member_id) === memberId &&
            (upperType === "PURCHASE" || upperType === "MANUAL_AWARD" || upperType === "EARN") &&
            Number(tx.points || 0) > 0 &&
            Boolean(txDate) &&
            isDateInRange(txDate!, start, end)
          );
        })
        .reduce((sum, tx) => sum + Number(tx.points || 0), 0);
    }

    return {
      memberId,
      memberName: `${member.first_name} ${member.last_name}`.trim(),
      tier: String(member.tier || "Bronze"),
      value,
    };
  });

  return rows.sort((a, b) => b.value - a.value).slice(0, 5);
}

export function buildShareAssetDataUrl(input: {
  memberName: string;
  tier: string;
  achievement: string;
  referralCode: string;
  badgeLabel: string;
  ranking?: number | null;
  privacy: SharePrivacySettings;
}) {
  const safeName = input.privacy.showName ? input.memberName : "CentralPerk Member";
  const safeCode = input.privacy.showReferralCode ? input.referralCode : "Hidden";
  const ranking = Number.isFinite(input.ranking) ? Number(input.ranking) : null;
  const visualTier = String(input.tier || "Bronze").trim();
  const palette =
    visualTier === "Gold"
      ? {
          start: "#6a3c00",
          end: "#f2be4f",
          accent: "#fff4cf",
          text: "#fffaf1",
          subtext: "#ffe29b",
          styleLabel: "Gold Luxe",
          badgeText: "#17304d",
          panelFill: "rgba(255,255,255,0.14)",
          softFill: "rgba(255,247,214,0.18)",
          lineFill: "rgba(255,247,214,0.22)",
        }
      : visualTier === "Silver"
        ? {
            start: "#22324a",
            end: "#98adc9",
            accent: "#edf4ff",
            text: "#f8fbff",
            subtext: "#d5e2f8",
            styleLabel: "Silver Stream",
            badgeText: "#1a2c44",
            panelFill: "rgba(255,255,255,0.14)",
            softFill: "rgba(237,244,255,0.16)",
            lineFill: "rgba(237,244,255,0.22)",
          }
        : {
            start: "#4d2616",
            end: "#cf7b49",
            accent: "#fff0e5",
            text: "#fff9f5",
            subtext: "#ffd7bf",
            styleLabel: "Bronze Pulse",
            badgeText: "#2f1a11",
            panelFill: "rgba(255,255,255,0.13)",
            softFill: "rgba(255,240,229,0.16)",
            lineFill: "rgba(255,240,229,0.22)",
          };
  const rankLabel = ranking === 1 ? "Champion Crown" : ranking === 2 ? "Runner-Up Shine" : ranking === 3 ? "Top 3 Spotlight" : "";
  const rankText = `${visualTier.toUpperCase()} MEMBER`;
  const topDecor =
    visualTier === "Gold"
      ? `
        <rect x="822" y="40" width="304" height="142" rx="38" fill="${palette.softFill}" />
        <circle cx="1044" cy="112" r="54" fill="${palette.lineFill}" />
        <path d="M882 146 C934 84, 1014 192, 1092 92" stroke="${palette.accent}" stroke-width="10" stroke-linecap="round" fill="none" />
      `
      : visualTier === "Silver"
        ? `
          <rect x="840" y="38" width="280" height="136" rx="36" fill="${palette.softFill}" />
          <path d="M846 138 C912 80, 1008 210, 1116 86" stroke="${palette.accent}" stroke-width="12" stroke-linecap="round" fill="none" />
          <circle cx="1060" cy="98" r="18" fill="${palette.accent}" />
        `
        : `
          <rect x="838" y="44" width="278" height="128" rx="34" fill="${palette.softFill}" />
          <path d="M874 160 L918 86 L962 160 L1006 106 L1050 160" stroke="${palette.accent}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        `;
  const lowerDecor =
    visualTier === "Gold"
      ? `
        <circle cx="120" cy="620" r="58" fill="${palette.softFill}" />
        <rect x="874" y="536" width="232" height="108" rx="30" fill="${palette.panelFill}" />
        <path d="M900 602 H1078" stroke="${palette.accent}" stroke-width="6" stroke-linecap="round" />
      `
      : visualTier === "Silver"
        ? `
          <circle cx="120" cy="620" r="56" fill="${palette.softFill}" />
          <rect x="882" y="548" width="224" height="96" rx="28" fill="${palette.panelFill}" />
          <path d="M896 604 H1088" stroke="${palette.accent}" stroke-width="6" stroke-linecap="round" />
        `
        : `
          <circle cx="120" cy="620" r="56" fill="${palette.softFill}" />
          <path d="M870 600 C930 560, 1010 660, 1090 610" stroke="${palette.accent}" stroke-width="8" stroke-linecap="round" fill="none" />
        `;
  const rankOverlay =
    ranking === 1
      ? `
        <circle cx="1048" cy="116" r="74" fill="rgba(255,255,255,0.16)" />
        <rect x="852" y="74" width="256" height="58" rx="18" fill="rgba(255,248,224,0.92)" />
        <path d="M888 90 L902 114 L918 84 L934 114 L950 90" stroke="#7a4b00" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        <text x="972" y="112" fill="#7a4b00" font-size="20" font-weight="700" font-family="Poppins, Arial, sans-serif">RANK #1 CHAMPION</text>
      `
      : ranking === 2
        ? `
          <circle cx="1048" cy="116" r="70" fill="rgba(255,255,255,0.14)" />
          <rect x="872" y="78" width="228" height="54" rx="18" fill="rgba(243,247,255,0.92)" />
          <circle cx="906" cy="104" r="12" fill="#6e89ad" />
          <circle cx="906" cy="104" r="20" fill="none" stroke="#6e89ad" stroke-width="4" />
          <text x="938" y="111" fill="#31486d" font-size="20" font-weight="700" font-family="Poppins, Arial, sans-serif">RANK #2</text>
        `
        : ranking === 3
          ? `
            <circle cx="1048" cy="116" r="66" fill="rgba(255,255,255,0.12)" />
            <rect x="890" y="80" width="196" height="52" rx="18" fill="rgba(255,244,238,0.92)" />
            <path d="M922 92 L940 120 L958 92" stroke="#7e4a31" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
            <text x="972" y="112" fill="#7e4a31" font-size="20" font-weight="700" font-family="Poppins, Arial, sans-serif">RANK #3</text>
          `
          : "";
  const rankAccent =
    ranking === 1
      ? `
        <rect x="74" y="566" width="232" height="44" rx="16" fill="rgba(255,248,224,0.22)" />
        <text x="102" y="594" fill="${palette.accent}" font-size="20" letter-spacing="2" font-family="Poppins, Arial, sans-serif">CHAMPION MOMENT</text>
      `
      : ranking === 2
        ? `
          <rect x="74" y="566" width="196" height="44" rx="16" fill="rgba(243,247,255,0.18)" />
          <text x="102" y="594" fill="${palette.accent}" font-size="20" letter-spacing="2" font-family="Poppins, Arial, sans-serif">RANK #2 GLOW</text>
        `
        : ranking === 3
          ? `
            <rect x="74" y="566" width="186" height="44" rx="16" fill="rgba(255,244,238,0.18)" />
            <text x="102" y="594" fill="${palette.accent}" font-size="20" letter-spacing="2" font-family="Poppins, Arial, sans-serif">TOP 3 FEATURED</text>
          `
          : "";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${palette.start}" />
          <stop offset="100%" stop-color="${palette.end}" />
        </linearGradient>
      </defs>
      <rect width="1200" height="760" rx="44" fill="url(#bg)" />
      ${topDecor}
      ${lowerDecor}
      ${rankOverlay}
      <text x="74" y="82" fill="${palette.subtext}" font-size="20" letter-spacing="4" font-family="Poppins, Arial, sans-serif">GREENOVATE</text>
      ${ranking || rankLabel ? `<rect x="74" y="106" width="210" height="38" rx="13" fill="${palette.panelFill}" />
      <text x="100" y="132" fill="${palette.text}" font-size="18" font-weight="700" font-family="Poppins, Arial, sans-serif">${rankText}</text>` : ""}
      <text x="74" y="${ranking || rankLabel ? "212" : "172"}" fill="${palette.text}" font-size="62" font-weight="700" font-family="Poppins, Arial, sans-serif">${safeName}</text>
      <text x="74" y="${ranking || rankLabel ? "272" : "232"}" fill="${palette.subtext}" font-size="30" font-family="Poppins, Arial, sans-serif">${input.achievement}</text>
      <rect x="74" y="${ranking || rankLabel ? "320" : "280"}" width="188" height="62" rx="18" fill="${palette.accent}" />
      <text x="103" y="${ranking || rankLabel ? "359" : "319"}" fill="${palette.badgeText}" font-size="30" font-weight="700" font-family="Poppins, Arial, sans-serif">${input.tier.toUpperCase()}</text>
      ${rankAccent || (rankLabel ? `<text x="74" y="438" fill="${palette.subtext}" font-size="18" letter-spacing="2" font-family="Poppins, Arial, sans-serif">${rankLabel}</text>` : "")}
      <text x="74" y="${rankAccent || rankLabel ? "516" : "448"}" fill="${palette.text}" font-size="44" font-weight="700" font-family="Poppins, Arial, sans-serif">${safeCode}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function triggerDownload(dataUrl: string, filename: string) {
  const browser = safeWindow();
  if (!browser) return;
  const link = browser.document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

export async function triggerImageDownload(dataUrl: string, filename: string) {
  const browser = safeWindow();
  if (!browser) return;

  if (!dataUrl.startsWith("data:image/svg+xml")) {
    triggerDownload(dataUrl, filename);
    return;
  }

  const svgMarkup = decodeURIComponent(dataUrl.split(",")[1] ?? "");
  const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = browser.URL.createObjectURL(svgBlob);
  const image = new browser.Image();

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to load share asset for PNG export."));
      image.src = svgUrl;
    });

    const canvas = browser.document.createElement("canvas");
    canvas.width = image.width || 1200;
    canvas.height = image.height || 760;

    const context = canvas.getContext("2d");
    if (!context) {
      triggerDownload(dataUrl, filename.replace(/\.png$/i, ".svg"));
      return;
    }

    context.drawImage(image, 0, 0);
    triggerDownload(canvas.toDataURL("image/png"), filename);
  } finally {
    browser.URL.revokeObjectURL(svgUrl);
  }
}

export function exportSurveyResponsesCsv(survey: SurveyDefinition) {
  const browser = safeWindow();
  if (!browser) return;

  const headers = ["memberId", "memberName", "submittedAt", ...survey.questions.map((question) => question.prompt)];
  const lines = [
    headers.join(","),
    ...survey.responses.map((response) =>
      [
        response.memberId,
        response.memberName,
        response.submittedAt,
        ...survey.questions.map((question) => JSON.stringify(response.answers[question.id] ?? "")),
      ].join(",")
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = browser.URL.createObjectURL(blob);
  triggerDownload(url, `${survey.title.replace(/\s+/g, "-").toLowerCase()}-responses.csv`);
  browser.setTimeout(() => browser.URL.revokeObjectURL(url), 500);
}

export function getSegmentAudienceSize(segment: EngagementSegment, members: Member[]) {
  if (segment === "All Members") return members.length;
  if (segment === "High Value") return members.filter((member) => Number(member.points_balance || 0) >= 1000).length;
  if (segment === "Inactive 60+ Days") return members.length;
  return members.filter((member) => String(member.tier || "Bronze").toLowerCase() === segment.toLowerCase()).length;
}
