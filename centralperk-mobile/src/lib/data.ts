import Constants from "expo-constants";
import { supabase } from "./supabase";
import type { AppNotification, LoyaltyTransaction, Member, RedemptionVoucher, Reward } from "./types";

const selectMembers =
  "id,member_id,member_number,first_name,last_name,email,phone,enrollment_date,points_balance,tier,status,birthdate,address,profile_photo_url,sms_enabled,email_enabled,push_enabled,promotional_opt_in";

const extra = (Constants.expoConfig?.extra || {}) as {
  apiBaseUrl?: string;
  enableDemoAuth?: boolean;
  allowProfileLogin?: boolean;
};

const apiBaseUrl = String(
  process.env.EXPO_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    extra.apiBaseUrl ||
    "",
).replace(/\/+$/, "");
const demoAuthEnabled =
  extra.enableDemoAuth !== false && process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH !== "false";
const profileLoginEnabled =
  extra.allowProfileLogin !== false && process.env.EXPO_PUBLIC_ALLOW_PROFILE_LOGIN !== "false";

export async function apiGet<T>(path: string): Promise<T> {
  if (!apiBaseUrl) throw new Error("Mobile API base URL is not configured.");
  const response = await fetch(`${apiBaseUrl}${path}`, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      payload?.error ||
      `Mobile API request failed (${response.status}).`;
    throw new Error(String(message));
  }
  return payload as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  if (!apiBaseUrl) throw new Error("Mobile API base URL is not configured.");
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      payload?.error ||
      `Mobile API request failed (${response.status}).`;
    throw new Error(String(message));
  }
  return payload as T;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  if (!apiBaseUrl) throw new Error("Mobile API base URL is not configured.");
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "PATCH",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      payload?.error ||
      `Mobile API request failed (${response.status}).`;
    throw new Error(String(message));
  }
  return payload as T;
}

function idempotencyKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function fullName(member?: Member | null) {
  return `${member?.first_name || ""} ${member?.last_name || ""}`.trim() || "Member";
}

export function memberKey(member?: Member | null) {
  return String(member?.id ?? member?.member_id ?? member?.member_number ?? "");
}

export function txDate(tx: LoyaltyTransaction) {
  return String(tx.transaction_date ?? tx.created_at ?? new Date().toISOString());
}

export function txLabel(tx: LoyaltyTransaction) {
  return String(tx.reason ?? tx.description ?? tx.transaction_type ?? "Activity");
}

export function isRedeem(tx: LoyaltyTransaction) {
  return String(tx.transaction_type || "").toUpperCase().includes("REDEEM");
}

export async function loadSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    await supabase.auth.signOut();
    return null;
  }
  return data.session;
}

export async function signIn(role: "customer" | "admin", emailOrId: string, password: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const email = role === "admin" ? `${emailOrId.trim()}@admin.loyaltyhub.com` : emailOrId.trim().toLowerCase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (role === "customer" && (demoAuthEnabled || profileLoginEnabled) && password.trim()) {
      const member = await loadMemberForEmail(email);
      if (member) return { session: null, member };
    }
    throw error;
  }
  if (role === "customer") {
    const member = await loadMemberForEmail(email);
    if (!member) throw new Error("No customer profile found for this login.");
    return { session: data.session, member };
  }
  return { session: data.session, member: null };
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("63") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("09") && digits.length === 11) return `+63${digits.slice(1)}`;
  if (digits.startsWith("9") && digits.length === 10) return `+63${digits}`;
  return phone.trim();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhilippinePhone(phone: string) {
  const normalized = normalizePhone(phone);
  return /^\+639\d{9}$/.test(normalized);
}

export async function registerCustomer(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthdate: string;
  password: string;
  referralCode?: string;
}) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  if (!input.firstName.trim() || !input.lastName.trim()) throw new Error("First name and last name are required.");
  if (!isValidEmail(email)) throw new Error("Please enter a valid email address.");
  if (!isValidPhilippinePhone(phone)) throw new Error("Please enter a valid Philippine mobile number, like +63 912 345 6789.");
  if (!input.birthdate) throw new Error("Birthdate is required.");
  if (input.password.length < 8) throw new Error("Password must be at least 8 characters long.");

  const { data: existingMembers, error: existingError } = await supabase
    .from("loyalty_members")
    .select("email,phone")
    .or(`email.ilike.${email},phone.eq.${phone}`);
  if (existingError) throw existingError;
  if ((existingMembers || []).some((member) => String(member.email || "").toLowerCase() === email)) {
    throw new Error("Email already registered.");
  }
  if ((existingMembers || []).some((member) => normalizePhone(String(member.phone || "")) === phone)) {
    throw new Error("This phone number is already registered.");
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: {
        first_name: input.firstName.trim(),
        last_name: input.lastName.trim(),
        birthdate: input.birthdate,
      },
    },
  });
  if (signUpError && !String(signUpError.message || "").toLowerCase().includes("already")) throw signUpError;

  const { data: member, error: insertError } = await supabase
    .from("loyalty_members")
    .insert([
      {
        first_name: input.firstName.trim(),
        last_name: input.lastName.trim(),
        email,
        phone,
        birthdate: input.birthdate,
        points_balance: 0,
        tier: "Bronze",
        promotional_opt_in: true,
        email_enabled: true,
      },
    ])
    .select(selectMembers)
    .single();

  if (insertError) throw insertError;

  await awardPoints({
    memberIdentifier: String(member.member_number || member.member_id || member.id),
    fallbackEmail: email,
    points: 100,
    transactionType: "EARN",
    reason: input.referralCode?.trim()
      ? `Welcome package from mobile registration (referral ${input.referralCode.trim()})`
      : "Welcome package from mobile registration",
  }).catch(() => null);

  return {
    member,
    emailConfirmationRequired: !signUpData?.session,
    message: signUpData?.session
      ? "Registration complete. Welcome package applied. You can now log in."
      : "Registration complete. Check your inbox for the confirmation link, then sign in.",
  };
}

export async function loadMemberForEmail(email: string) {
  const identifier = encodeURIComponent(email.trim().toLowerCase());
  const payload = await apiGet<{ ok: boolean; member?: Member }>(`/api/members/resolve?identifier=${identifier}&fallbackEmail=${identifier}`);
  return payload.member ?? null;
}

export async function loadCurrentMember(fallbackEmail?: string) {
  if (!supabase) return null;
  const email = fallbackEmail || (await supabase.auth.getUser()).data.user?.email || "";
  if (!email) return null;
  return loadMemberForEmail(email);
}

export async function loadAdminData() {
  const [membersRes, txRes, rewardsRes] = await Promise.all([
    apiGet<{ ok: boolean; members: Member[] }>("/api/admin/members"),
    apiGet<{ ok: boolean; transactions: LoyaltyTransaction[] }>("/api/points/ledger?limit=800"),
    apiGet<{ ok: boolean; rewards: Reward[] }>("/api/rewards"),
  ]);
  return {
    members: membersRes.members || [],
    transactions: txRes.transactions || [],
    rewards: (rewardsRes.rewards || []).filter((reward) => reward.is_active !== false),
    logins: [],
  };
}

export async function awardPoints(input: {
  memberIdentifier: string;
  fallbackEmail?: string;
  points: number;
  transactionType: "PURCHASE" | "MANUAL_AWARD" | "EARN";
  reason: string;
  amountSpent?: number;
  productCategory?: string;
}) {
  return apiPost<{
    ok: boolean;
    result?: { newBalance: number; newTier: string; pointsAdded: number; bonusPointsAdded?: number };
    pointsAdded?: number;
    newBalance?: number;
    newTier?: string;
  }>("/api/points/award", { ...input, idempotencyKey: idempotencyKey("mobile-award") });
}

export async function loadCustomerData(member: Member) {
  const key = encodeURIComponent(String(member.member_number || member.memberId || memberKey(member)));
  const fallbackEmail = member.email ? `&fallbackEmail=${encodeURIComponent(member.email)}` : "";
  const memberNumber = String(member.member_number || "");
  const [activityRes, rewardsRes] = await Promise.all([
    apiGet<{ ok: boolean; history: LoyaltyTransaction[]; balance?: { points_balance?: number; tier?: string } }>(
      `/api/points/activity?memberIdentifier=${key}${fallbackEmail}&limit=120`,
    ),
    apiGet<{ ok: boolean; rewards: Reward[] }>("/api/rewards"),
  ]);
  return {
    transactions: activityRes.history || [],
    rewards: (rewardsRes.rewards || []).filter((reward) => reward.is_active !== false),
  };
}

export async function redeemReward(member: Member, reward: Reward) {
  const points = Math.max(0, Number(reward.points_cost || 0));
  const balance = Math.max(0, Number(member.points_balance || 0));
  if (balance < points) throw new Error("Not enough points for this reward.");
  await apiPost("/api/points/redeem", {
    memberIdentifier: String(member.member_number || member.memberId || memberKey(member)),
    fallbackEmail: member.email,
    points,
    reason: `Redeemed ${reward.name || "reward"} from mobile app`,
    rewardCatalogId: reward.id ?? reward.reward_id ?? null,
  });
}

export async function redeemPoints(input: {
  memberIdentifier: string;
  fallbackEmail?: string;
  points: number;
  reason: string;
  transactionType?: "REDEEM" | "GIFT";
  rewardCatalogId?: string | number | null;
}) {
  return apiPost<{ ok: boolean; result?: { newBalance: number; newTier: string; pointsDeducted: number } }>(
    "/api/points/redeem",
    { ...input, idempotencyKey: idempotencyKey("mobile-redeem") },
  );
}

export async function loadVouchers(input: { memberId?: string; email?: string }) {
  const params = new URLSearchParams();
  if (input.memberId) params.set("memberId", input.memberId);
  if (input.email) params.set("email", input.email);
  const payload = await apiGet<{ ok: boolean; vouchers: RedemptionVoucher[] }>(
    `/api/vouchers${params.toString() ? `?${params.toString()}` : ""}`,
  );
  return payload.vouchers || [];
}

export async function createVoucher(voucher: RedemptionVoucher) {
  const payload = await apiPost<{ ok: boolean; voucher: RedemptionVoucher }>("/api/vouchers", voucher);
  return payload.voucher;
}

export async function validateVoucher(voucherId: string, voucherCode: string) {
  const payload = await apiPatch<{ ok: boolean; voucher: RedemptionVoucher }>(`/api/vouchers/${voucherId}`, {
    action: "validate",
    voucherCode,
  });
  return payload.voucher;
}

export async function loadNotifications(input: { memberId?: string; email?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (input.memberId) params.set("memberId", input.memberId);
  if (input.email) params.set("email", input.email);
  if (input.limit) params.set("limit", String(input.limit));
  const payload = await apiGet<{ ok: boolean; notifications: AppNotification[] }>(
    `/api/notifications${params.toString() ? `?${params.toString()}` : ""}`,
  );
  return payload.notifications || [];
}

export async function markNotificationRead(id: string) {
  return apiPatch<{ ok: boolean }>(`/api/notifications/${id}/read`, {});
}

export async function updateMemberProfile(member: Member, patch: Partial<Member>) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const key = memberKey(member);
  const { error } = await supabase.from("loyalty_members").update(patch).eq("id", key);
  if (error) throw error;
}
