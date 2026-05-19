import type { MemberData } from "../types/loyalty";
import { requestJson } from "./api";
import {
  applyReferralCodeViaApi,
  claimBirthdayRewardViaApi,
  createReferralViaApi,
  generateFeedbackInsightsViaApi,
  loadBirthdayRewardStatusViaApi,
  loadBirthdaySettingsViaApi,
  loadCommunicationPreferenceViaApi,
  loadFeedbackViaApi,
  loadLatestFeedbackInsightsViaApi,
  loadReferralsViaApi,
  resolveMemberViaMemberApi,
  saveBirthdaySettingsViaApi,
  saveCommunicationPreferenceViaApi,
  submitFeedbackViaApi,
  validateReferralCodeViaApi,
} from "./member-service-api";

export type MemberSegment = "High Value" | "Active" | "At Risk" | "Inactive";
export const SYSTEM_MEMBER_SEGMENTS: MemberSegment[] = ["High Value", "Active", "At Risk", "Inactive"];

export interface ManualSegment {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface SegmentStats {
  segment: string;
  count: number;
  share: number;
}

export interface CommunicationPreference {
  sms: boolean;
  email: boolean;
  push: boolean;
  promotionalOptIn: boolean;
  frequency: "daily" | "weekly" | "never";
}

export interface ReferralRecord {
  id: string;
  referrerMemberId: string;
  referrerCode: string;
  refereeEmail: string;
  refereeMemberId?: string;
  status: "pending" | "joined";
  createdAt: string;
  convertedAt?: string;
  bonusAwarded?: boolean;
}

export interface FeedbackRecord {
  id: string;
  memberId: string;
  memberName: string;
  category: "points" | "rewards" | "service" | "app";
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string;
  contactOptIn: boolean;
  contactInfo: string | null;
  createdAt: string;
}

export interface BirthdayRewardSettings {
  amounts: Record<MemberData["tier"], number>;
  releaseTiming: "first_day_of_birthday_month" | "birthday_date";
  fulfillmentMode: "manual_claim" | "auto_credit";
  claimWindow: "birthday_month_only" | "birthday_week";
}

export const DEFAULT_BIRTHDAY_REWARD_SETTINGS: BirthdayRewardSettings = {
  amounts: {
    Bronze: 100,
    Silver: 500,
    Gold: 1000,
  },
  releaseTiming: "first_day_of_birthday_month",
  fulfillmentMode: "auto_credit",
  claimWindow: "birthday_month_only",
};

function normalizeBirthdaySettings(value: unknown): BirthdayRewardSettings {
  const raw = value && typeof value === "object" ? (value as Partial<BirthdayRewardSettings>) : {};
  return {
    amounts: {
      Bronze: Math.max(0, Number(raw.amounts?.Bronze ?? DEFAULT_BIRTHDAY_REWARD_SETTINGS.amounts.Bronze) || 0),
      Silver: Math.max(0, Number(raw.amounts?.Silver ?? DEFAULT_BIRTHDAY_REWARD_SETTINGS.amounts.Silver) || 0),
      Gold: Math.max(0, Number(raw.amounts?.Gold ?? DEFAULT_BIRTHDAY_REWARD_SETTINGS.amounts.Gold) || 0),
    },
    releaseTiming:
      raw.releaseTiming === "birthday_date" ? "birthday_date" : DEFAULT_BIRTHDAY_REWARD_SETTINGS.releaseTiming,
    fulfillmentMode:
      raw.fulfillmentMode === "manual_claim" ? "manual_claim" : DEFAULT_BIRTHDAY_REWARD_SETTINGS.fulfillmentMode,
    claimWindow: raw.claimWindow === "birthday_week" ? "birthday_week" : DEFAULT_BIRTHDAY_REWARD_SETTINGS.claimWindow,
  };
}

function safeWindow() {
  return typeof window === "undefined" ? null : window;
}

export function loadBirthdayRewardSettings(): BirthdayRewardSettings {
  return DEFAULT_BIRTHDAY_REWARD_SETTINGS;
}

export async function loadBirthdayRewardSettingsFromApi(): Promise<BirthdayRewardSettings> {
  return normalizeBirthdaySettings(await loadBirthdaySettingsViaApi().catch(() => DEFAULT_BIRTHDAY_REWARD_SETTINGS));
}

export async function saveBirthdayRewardSettings(settings: BirthdayRewardSettings) {
  return normalizeBirthdaySettings(await saveBirthdaySettingsViaApi(settings));
}

function normalizeManualSegment(value: string): MemberSegment | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "high value") return "High Value";
  if (normalized === "active") return "Active";
  if (normalized === "at risk") return "At Risk";
  if (normalized === "inactive") return "Inactive";
  return null;
}

function validateSegmentName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Segment name is required.");
  if (trimmed.length > 80) throw new Error("Segment name must be 80 characters or fewer.");
  return trimmed;
}

export async function createCustomSegment(input: { name: string; description?: string }) {
  const name = validateSegmentName(input.name);
  const description = input.description?.trim() || null;

  const response = await requestJson<{ ok: true; segment: ManualSegment }>("/api/segments", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
  return response.segment;
}

export async function updateCustomSegment(segmentId: string, input: { name: string; description?: string }) {
  const name = validateSegmentName(input.name);
  const description = input.description?.trim() || null;

  const response = await requestJson<{ ok: true; segment: ManualSegment }>(`/api/segments/${encodeURIComponent(segmentId)}`, {
    method: "PATCH",
    body: JSON.stringify({ name, description }),
  });
  return response.segment;
}

export async function deleteCustomSegment(segmentId: string) {
  await requestJson<{ ok: true }>(`/api/segments/${encodeURIComponent(segmentId)}`, {
    method: "DELETE",
  });
}

export async function assignMembersToSegment(memberIds: Array<string | number>, segmentId: string) {
  if (!memberIds.length) return;
  await requestJson<{ ok: true; assigned: number }>("/api/segments/assignments", {
    method: "POST",
    body: JSON.stringify({ memberIds, segmentId }),
  });
}

export async function removeMembersFromSegment(memberIds: Array<string | number>, segmentId: string) {
  if (!memberIds.length) return;
  await requestJson<{ ok: true; removed: number }>("/api/segments/assignments", {
    method: "DELETE",
    body: JSON.stringify({ memberIds, segmentId }),
  });
}

export async function fetchAllSegments() {
  const response = await requestJson<{ ok: true; segments: ManualSegment[] }>("/api/segments");
  return response.segments || [];
}

export async function fetchMembersInSegment(segmentId: string) {
  const params = new URLSearchParams({ segmentId });
  const response = await requestJson<{ ok: true; assignments: unknown[] }>(`/api/segments/assignments?${params.toString()}`);
  return response.assignments || [];
}

export async function fetchSegmentAssignments() {
  const response = await requestJson<{ ok: true; assignments: unknown[] }>("/api/segments/assignments");
  return response.assignments || [];
}

export async function saveManualSegment(memberNumber: string, segmentName: string) {
  const normalized = normalizeManualSegment(segmentName);
  if (!normalized) throw new Error("Manual segment must be one of: High Value, Active, At Risk, Inactive.");

  const member = await resolveMemberViaMemberApi({ identifier: memberNumber });
  if (!member) throw new Error("Member not found for manual segment update.");

  const segments = await fetchAllSegments();
  const segment = segments.find((row) => row.name === normalized && row.is_system);
  if (!segment) throw new Error("System segment not found.");

  await assignMembersToSegment([member.id ?? member.memberId ?? member.member_id], segment.id);

  return normalized;
}

export function exportMembersCsv(rows: Array<{
  memberNumber: string;
  name: string;
  email: string;
  phone: string;
  effectiveSegment: string;
  customSegments: string[];
  exportedSegmentContext: string;
}>) {
  const headers = ["Member #", "Name", "Email", "Phone", "Effective Segment", "Custom Segments", "Exported Segment Context"];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push([
      row.memberNumber,
      row.name,
      row.email,
      row.phone,
      row.effectiveSegment,
      row.customSegments.join(" | "),
      row.exportedSegmentContext,
    ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
  }

  const win = safeWindow();
  if (!win) return;
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `member-segments-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function buildSegmentStats(totalMembers: number, segments: string[]): SegmentStats[] {
  const base: Record<string, number> = {
    "High Value": 0,
    Active: 0,
    "At Risk": 0,
    Inactive: 0,
  };

  for (const segment of segments) {
    const key = String(segment || "").trim();
    if (!key) continue;
    base[key] = (base[key] || 0) + 1;
  }

  return Object.keys(base).map((segment) => ({
    segment,
    count: base[segment],
    share: totalMembers > 0 ? (base[segment] / totalMembers) * 100 : 0,
  })).sort((a, b) => b.count - a.count || a.segment.localeCompare(b.segment));
}

export const defaultCommunicationPreference: CommunicationPreference = {
  sms: true,
  email: true,
  push: true,
  promotionalOptIn: true,
  frequency: "weekly",
};

function toCommunicationPreference(row?: Record<string, unknown> | null): CommunicationPreference {
  if (!row) return defaultCommunicationPreference;
  const frequency = String(row.communication_frequency || "weekly").toLowerCase();
  return {
    sms: Boolean(row.sms_enabled ?? true),
    email: Boolean(row.email_enabled ?? true),
    push: Boolean(row.push_enabled ?? true),
    promotionalOptIn: Boolean(row.promotional_opt_in ?? true),
    frequency: frequency === "daily" || frequency === "never" ? frequency : "weekly",
  };
}

export async function loadCommunicationPreference(memberId: string, fallbackEmail?: string): Promise<CommunicationPreference> {
  const response = await loadCommunicationPreferenceViaApi(memberId, fallbackEmail);
  return toCommunicationPreference({
    sms_enabled: response.preference.sms,
    email_enabled: response.preference.email,
    push_enabled: response.preference.push,
    promotional_opt_in: response.preference.promotionalOptIn,
    communication_frequency: response.preference.frequency,
  });
}

export async function saveCommunicationPreference(memberId: string, preference: CommunicationPreference, fallbackEmail?: string) {
  await saveCommunicationPreferenceViaApi(memberId, preference, fallbackEmail);
}

export function canSendNotificationByPreference(
  pref: CommunicationPreference,
  channel: "sms" | "email" | "push",
  isTransactional: boolean
) {
  if (isTransactional) {
    return true;
  }

  if (pref.frequency === "never") return false;
  if (!pref.promotionalOptIn) return false;
  return channel === "sms" ? pref.sms : channel === "email" ? pref.email : pref.push;
}

export function buildReferralCode(member: Pick<MemberData, "memberId" | "fullName">) {
  return `REF${member.memberId.replace(/\D/g, "").slice(-6).padStart(6, "0")}`;
}

function normalizeReferralRow(row: Record<string, unknown>): ReferralRecord {
  return {
    id: String(row.id ?? crypto.randomUUID()),
    referrerMemberId: String(row.referrer_member_number ?? row.referrer_member_id ?? ""),
    referrerCode: String(row.referrer_code ?? ""),
    refereeEmail: String(row.referee_email ?? ""),
    refereeMemberId: row.referee_member_number ? String(row.referee_member_number) : undefined,
    status: String(row.status || "pending") === "joined" ? "joined" : "pending",
    createdAt: String(row.created_at ?? new Date().toISOString()),
    convertedAt: row.converted_at ? String(row.converted_at) : undefined,
    bonusAwarded: Boolean(row.bonus_awarded),
  };
}

export async function loadReferrals(memberNumber: string): Promise<ReferralRecord[]> {
  return (await loadReferralsViaApi(memberNumber)).map(normalizeReferralRow);
}

export async function loadAllReferrals(): Promise<ReferralRecord[]> {
  return (await loadReferralsViaApi()).map(normalizeReferralRow);
}

export async function createReferral(input: { referrerMemberId: string; refereeEmail: string }) {
  return normalizeReferralRow(await createReferralViaApi(input));
}

export async function getMemberReferralCode(memberId: string, fallbackEmail?: string): Promise<string> {
  const member = await resolveMemberViaMemberApi({ identifier: memberId, fallbackEmail }).catch(() => null);
  const memberNumber = String(member?.member_number ?? member?.memberNumber ?? memberId);
  return buildReferralCode({ memberId: memberNumber, fullName: "" } as Pick<MemberData, "memberId" | "fullName">);
}

export async function validateReferralCode(referralCode: string) {
  return validateReferralCodeViaApi(referralCode.trim().toUpperCase());
}

export async function applyReferralCodeForSignup(input: {
  referralCode: string;
  refereeMemberId: string;
  refereeEmail: string;
}) {
  const response = await applyReferralCodeViaApi(input);
  return {
    applied: Boolean(response.applied),
    referrerPoints: Math.max(0, Number(response.referrerPoints || 0)),
    refereePoints: Math.max(0, Number(response.refereePoints || 0)),
    referrerMemberId: String(response.referral?.referrerMemberId || ""),
  };
}

export function getBirthdayRewardPoints(tier: MemberData["tier"]) {
  return loadBirthdayRewardSettings().amounts[tier] ?? DEFAULT_BIRTHDAY_REWARD_SETTINGS.amounts.Bronze;
}

export function isBirthdayMonth(member: Pick<MemberData, "birthdate">) {
  if (!member.birthdate) return false;
  const d = new Date(member.birthdate);
  if (Number.isNaN(d.getTime())) return false;
  return d.getMonth() === new Date().getMonth();
}

export function shouldAutoCreditBirthdayReward(
  member: Pick<MemberData, "birthdate">,
  settings: BirthdayRewardSettings = loadBirthdayRewardSettings(),
  now = new Date()
) {
  if (settings.fulfillmentMode !== "auto_credit" || !member.birthdate) return false;

  const birthday = new Date(member.birthdate);
  if (Number.isNaN(birthday.getTime())) return false;
  if (birthday.getMonth() !== now.getMonth()) return false;

  if (settings.releaseTiming === "birthday_date") {
    return now.getDate() >= birthday.getDate();
  }

  return true;
}

export async function hasBirthdayClaimedThisYear(memberId: string, fallbackEmail?: string) {
  const status = await loadBirthdayRewardStatus(memberId, fallbackEmail);
  return status.hasReward;
}

export async function claimBirthdayReward(memberId: string, fallbackEmail?: string) {
  const settings = await loadBirthdayRewardSettingsFromApi();
  const member = await resolveMemberViaMemberApi({ identifier: memberId, fallbackEmail }).catch(() => null);
  const tier = String(member?.tier || "Bronze") as MemberData["tier"];
  const pointsAwarded = settings.amounts[tier] ?? settings.amounts.Bronze;
  const result = await claimBirthdayRewardViaApi({
    memberId,
    fallbackEmail,
    pointsAwarded,
    badgeLabel: "Birthday Reward",
  });
  return {
    granted: true,
    pointsAwarded: Math.max(0, Number(result.reward?.points_awarded ?? pointsAwarded)),
    voucherCode: result.reward?.voucher_code ? String(result.reward.voucher_code) : null,
  };
}

export async function loadBirthdayRewardStatus(memberId: string, fallbackEmail?: string) {
  const status = await loadBirthdayRewardStatusViaApi(memberId, fallbackEmail);
  return {
    hasReward: Boolean(status.hasReward),
    voucherCode: status.voucherCode ? String(status.voucherCode) : null,
    pointsAwarded: Math.max(0, Number(status.pointsAwarded || 0)),
    badgeLabel: status.badgeLabel ? String(status.badgeLabel) : null,
  };
}

const feedbackCategories = new Set<FeedbackRecord["category"]>(["points", "rewards", "service", "app"]);

function normalizeFeedbackRow(row: Record<string, unknown>): FeedbackRecord {
  const category = String(row.category || "service").toLowerCase() as FeedbackRecord["category"];
  const rating = Math.max(1, Math.min(5, Number(row.rating) || 5)) as FeedbackRecord["rating"];
  return {
    id: String(row.id ?? crypto.randomUUID()),
    memberId: String(row.member_number ?? row.member_id ?? ""),
    memberName: String(row.member_name ?? ""),
    category: feedbackCategories.has(category) ? category : "service",
    rating,
    comment: String(row.comment ?? ""),
    contactOptIn: Boolean(row.contact_opt_in),
    contactInfo: row.contact_info ? String(row.contact_info) : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function submitFeedback(entry: Omit<FeedbackRecord, "id" | "createdAt">) {
  if (!feedbackCategories.has(entry.category)) {
    throw new Error("Feedback category must be one of: points, rewards, service, app.");
  }
  if (entry.rating < 1 || entry.rating > 5) {
    throw new Error("Rating must be between 1 and 5.");
  }
  const comment = entry.comment.trim();
  if (!comment) {
    throw new Error("Feedback comment is required.");
  }
  if (comment.length > 500) {
    throw new Error("Feedback comment must be 500 characters or less.");
  }

  return normalizeFeedbackRow(await submitFeedbackViaApi({
    memberId: entry.memberId,
    memberName: entry.memberName.trim(),
    category: entry.category,
    rating: entry.rating,
    comment,
    contactOptIn: Boolean(entry.contactOptIn),
    contactInfo: entry.contactInfo?.trim() ? entry.contactInfo.trim() : null,
  }));
}

export async function loadFeedback(): Promise<FeedbackRecord[]> {
  return (await loadFeedbackViaApi()).map(normalizeFeedbackRow);
}

export async function queueManagerFeedbackNotification(record: FeedbackRecord) {
  await requestJson("/api/notifications", {
    method: "POST",
    body: JSON.stringify({
      memberId: record.memberId,
      channel: "email",
      subject: `New ${record.category} feedback`,
      body: `${record.memberName} rated ${record.rating}/5: ${record.comment}`,
      status: "queued",
    }),
  }).catch(() => undefined);
}

export interface FeedbackInsights {
  sentimentSplit: { positive: number; neutral: number; negative: number };
  wordCloud: Array<{ word: string; weight: number }>;
  topTopics: Array<{ topic: string; count: number }>;
  similarFeedbackGroups: Array<{ topic: string; count: number; averageSimilarity: number; feedbackIds: string[] }>;
  sourceCount: number;
  createdAt?: string;
}

export async function generateFeedbackInsights(): Promise<FeedbackInsights> {
  return (await generateFeedbackInsightsViaApi()) as FeedbackInsights;
}

export async function loadLatestFeedbackInsights(): Promise<FeedbackInsights | null> {
  const data = await loadLatestFeedbackInsightsViaApi();
  return data ? (data as FeedbackInsights) : null;
}
