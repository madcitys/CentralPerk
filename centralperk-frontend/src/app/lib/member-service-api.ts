import { requestJson } from "./api";

type AnyRecord = Record<string, any>;

export async function resolveMemberViaMemberApi(input: {
  identifier?: string;
  fallbackEmail?: string;
  name?: string;
}) {
  const params = new URLSearchParams();
  if (input.identifier?.trim()) params.set("identifier", input.identifier.trim());
  if (input.fallbackEmail?.trim()) params.set("fallbackEmail", input.fallbackEmail.trim());
  if (input.name?.trim()) params.set("name", input.name.trim());
  if (!params.toString()) return null;

  const response = await requestJson<{ ok: true; member?: AnyRecord }>(`/api/members/resolve?${params.toString()}`);
  return response.member ?? null;
}

export async function findMemberProfileByEmail(email: string) {
  const params = new URLSearchParams({ email: email.trim() });
  const response = await requestJson<{ ok: true; member?: AnyRecord }>(`/api/members/profile?${params.toString()}`);
  return response.member ?? null;
}

export async function findDuplicateMembers(input: { email?: string; phone?: string }) {
  const params = new URLSearchParams();
  if (input.email?.trim()) params.set("email", input.email.trim());
  if (input.phone?.trim()) params.set("phone", input.phone.trim());
  if (!params.toString()) return [];

  const response = await requestJson<{ ok: true; members: AnyRecord[] }>(`/api/members/duplicates?${params.toString()}`);
  return response.members || [];
}

export async function createOrRepairMemberProfileViaApi(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthdate: string;
}) {
  return requestJson<{
    ok: true;
    member: AnyRecord;
    recoveredFromExistingAuthSignup: boolean;
  }>("/api/members/profile", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateMemberProfileViaApi(memberIdentifier: string, input: {
  fallbackEmail?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  birthdate?: string;
  address?: string | null;
  profilePhotoUrl?: string | null;
}) {
  return requestJson<{ ok: true; member: AnyRecord }>(`/api/members/${encodeURIComponent(memberIdentifier)}/profile`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function loadCommunicationPreferenceViaApi(memberIdentifier: string, fallbackEmail?: string) {
  const params = new URLSearchParams();
  if (fallbackEmail?.trim()) params.set("fallbackEmail", fallbackEmail.trim());
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestJson<{ ok: true; preference: AnyRecord }>(
    `/api/members/${encodeURIComponent(memberIdentifier)}/communication-preference${suffix}`,
  );
}

export async function saveCommunicationPreferenceViaApi(memberIdentifier: string, preference: AnyRecord, fallbackEmail?: string) {
  const params = new URLSearchParams();
  if (fallbackEmail?.trim()) params.set("fallbackEmail", fallbackEmail.trim());
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestJson<{ ok: true; preference: AnyRecord }>(
    `/api/members/${encodeURIComponent(memberIdentifier)}/communication-preference${suffix}`,
    {
      method: "PATCH",
      body: JSON.stringify(preference),
    },
  );
}

export async function recordMemberLoginActivityViaApi(memberIdentifier: string, input: {
  channel?: "web" | "mobile" | "kiosk" | "system";
  source?: string;
}) {
  return requestJson<{ ok: true; recorded: boolean }>(`/api/members/${encodeURIComponent(memberIdentifier)}/login-activity`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function loadReferralsViaApi(memberId?: string) {
  const params = new URLSearchParams();
  if (memberId?.trim()) params.set("memberId", memberId.trim());
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await requestJson<{ ok: true; referrals: AnyRecord[] }>(`/api/members/referrals${suffix}`);
  return response.referrals || [];
}

export async function createReferralViaApi(input: { referrerMemberId: string; refereeEmail: string }) {
  const response = await requestJson<{ ok: true; referral: AnyRecord }>("/api/members/referrals", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.referral;
}

export async function validateReferralCodeViaApi(referralCode: string) {
  const params = new URLSearchParams({ code: referralCode });
  return requestJson<{
    ok: true;
    isValid: boolean;
    reason: "empty" | "invalid" | "table_missing" | null;
    referrerMemberId: string | null;
    referrerName: string | null;
  }>(`/api/members/referrals/validate?${params.toString()}`);
}

export async function applyReferralCodeViaApi(input: {
  referralCode: string;
  refereeMemberId: string;
  refereeEmail: string;
}) {
  return requestJson<{
    ok: true;
    applied: boolean;
    reason?: string;
    referral?: AnyRecord;
    referrerPoints?: number;
    refereePoints?: number;
  }>("/api/members/referrals/apply", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function loadBirthdaySettingsViaApi() {
  const response = await requestJson<{ ok: true; settings: AnyRecord }>("/api/members/birthday-settings");
  return response.settings;
}

export async function saveBirthdaySettingsViaApi(settings: AnyRecord) {
  const response = await requestJson<{ ok: true; settings: AnyRecord }>("/api/members/birthday-settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
  return response.settings;
}

export async function loadBirthdayRewardStatusViaApi(memberId: string, fallbackEmail?: string) {
  const params = new URLSearchParams({ memberId });
  if (fallbackEmail?.trim()) params.set("fallbackEmail", fallbackEmail.trim());
  const response = await requestJson<{ ok: true; status: AnyRecord }>(`/api/members/birthday-rewards/status?${params.toString()}`);
  return response.status;
}

export async function claimBirthdayRewardViaApi(input: {
  memberId: string;
  fallbackEmail?: string;
  pointsAwarded?: number;
  voucherCode?: string | null;
  badgeLabel?: string | null;
}) {
  return requestJson<{ ok: true; reward: AnyRecord }>("/api/members/birthday-rewards/claim", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function loadFeedbackViaApi() {
  const response = await requestJson<{ ok: true; feedback: AnyRecord[] }>("/api/members/feedback");
  return response.feedback || [];
}

export async function submitFeedbackViaApi(input: AnyRecord) {
  const response = await requestJson<{ ok: true; feedback: AnyRecord }>("/api/members/feedback", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.feedback;
}

export async function generateFeedbackInsightsViaApi() {
  const response = await requestJson<{ ok: true; insights: AnyRecord }>("/api/members/feedback-insights/generate", {
    method: "POST",
  });
  return response.insights;
}

export async function loadLatestFeedbackInsightsViaApi() {
  const response = await requestJson<{ ok: true; insights: AnyRecord | null }>("/api/members/feedback-insights/latest");
  return response.insights;
}

export async function loadTierHistoryViaApi(memberIdentifier: string, fallbackEmail?: string) {
  const params = new URLSearchParams({ memberIdentifier });
  if (fallbackEmail?.trim()) params.set("fallbackEmail", fallbackEmail.trim());
  const response = await requestJson<{ ok: true; history: AnyRecord[] }>(`/api/members/tier-history?${params.toString()}`);
  return response.history || [];
}

export async function loadBadgeProgressViaApi(memberIdentifier?: string, fallbackEmail?: string) {
  const params = new URLSearchParams();
  if (memberIdentifier?.trim()) params.set("memberIdentifier", memberIdentifier.trim());
  if (fallbackEmail?.trim()) params.set("fallbackEmail", fallbackEmail.trim());
  if (!params.toString()) return [];
  const response = await requestJson<{ ok: true; badges: AnyRecord[] }>(`/api/members/badges/progress?${params.toString()}`);
  return response.badges || [];
}

export async function loadBadgeLeaderboardViaApi(limit = 10) {
  const params = new URLSearchParams({ limit: String(limit) });
  const response = await requestJson<{ ok: true; leaderboard: AnyRecord[] }>(`/api/members/badges/leaderboard?${params.toString()}`);
  return response.leaderboard || [];
}
