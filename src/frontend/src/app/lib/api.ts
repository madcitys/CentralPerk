import type { MemberData, Transaction } from "../types/loyalty";
import type { PromotionCampaign } from "./promotions";
import type { AppNotification } from "./notifications";
import {
  createDefaultCommunicationAnalytics,
  createDefaultMemberData,
  createDefaultPartnerDashboardRow,
  DEFAULT_EARNING_RULES,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_SEGMENTS,
  DEFAULT_TIER_RULES,
  ensureArray,
  ensureNumber,
  ensureNumberRecord,
  type PartnerDashboardRow,
} from "./defaults";

const GET_CACHE_TTL_MS = 20_000;
const getCache = new Map<string, { loadedAt: number; payload: unknown }>();
const getInFlight = new Map<string, Promise<unknown>>();

export type SafeApiResult<TData> =
  | { ok: true; data: TData }
  | { ok: false; error: string; data: TData };

export const API_BASE_URL =
  (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000").replace(/\/+$/, "");

export function apiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

export async function requestJson<TResponse = unknown>(
  path: string,
  init?: RequestInit & { idempotencyKey?: string },
): Promise<TResponse> {
  const method = String(init?.method || "GET").toUpperCase();
  const isGet = method === "GET";
  const now = Date.now();
  const url = apiUrl(path);

  if (isGet) {
    const cached = getCache.get(url);
    if (cached && now - cached.loadedAt < GET_CACHE_TTL_MS) return cached.payload as TResponse;

    const inFlight = getInFlight.get(url);
    if (inFlight) return inFlight as Promise<TResponse>;
  }

  const headers = new Headers(init?.headers ?? {});
  headers.set("Content-Type", "application/json");
  if (init?.idempotencyKey) {
    headers.set("Idempotency-Key", init.idempotencyKey);
  }

  const request = fetch(url, {
    cache: init?.cache ?? "no-store",
    ...init,
    headers,
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as { error?: unknown }).error || `Request failed (${response.status}).`));
      }
      if (isGet) {
        getCache.set(url, { loadedAt: Date.now(), payload });
      } else {
        getCache.clear();
      }
      return payload as TResponse;
    })
    .finally(() => {
      if (isGet) getInFlight.delete(url);
    });

  if (isGet) getInFlight.set(url, request);
  return request;
}

function normalizeApiError(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : "";
  if (!message) return "API_UNAVAILABLE";
  if (/failed to fetch|fetch failed|network|connection|refused|load failed/i.test(message)) {
    return "API_UNAVAILABLE";
  }
  return message;
}

function fallbackValue<TResponse>(fallback: TResponse | (() => TResponse)) {
  return typeof fallback === "function" ? (fallback as () => TResponse)() : fallback;
}

export async function requestJsonSafe<TResponse = unknown>(
  path: string,
  fallback: TResponse | (() => TResponse),
  init?: RequestInit & { idempotencyKey?: string },
): Promise<SafeApiResult<TResponse>> {
  try {
    return {
      ok: true,
      data: await requestJson<TResponse>(path, init),
    };
  } catch (error) {
    return {
      ok: false,
      error: normalizeApiError(error),
      data: fallbackValue(fallback),
    };
  }
}

export function clearApiReadCache() {
  getCache.clear();
  getInFlight.clear();
}

export function createIdempotencyKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function resolveMemberIdentifier(memberIdentifier?: string, fallbackEmail?: string) {
  return String(memberIdentifier || fallbackEmail || "").trim();
}

function normalizeTier(value: unknown): MemberData["tier"] {
  const tier = String(value || "").trim().toLowerCase();
  if (tier === "platinum") return "Gold";
  if (tier === "gold") return "Gold";
  if (tier === "silver") return "Silver";
  return "Bronze";
}

function normalizeNotification(input: Partial<AppNotification> | null | undefined): AppNotification {
  return {
    id: String(input?.id ?? crypto.randomUUID()),
    subject: String(input?.subject ?? "Notification"),
    message: String(input?.message ?? ""),
    createdAt: String(input?.createdAt ?? new Date().toISOString()),
    status: String(input?.status ?? "pending"),
  };
}

function normalizePartnerDashboardRow(input: Partial<PartnerDashboardRow> | null | undefined): PartnerDashboardRow {
  const fallback = createDefaultPartnerDashboardRow();
  return {
    partner: {
      id: String(input?.partner?.id ?? fallback.partner.id),
      partnerCode: String(input?.partner?.partnerCode ?? fallback.partner.partnerCode),
      partnerName: String(input?.partner?.partnerName ?? fallback.partner.partnerName),
      description: input?.partner?.description ?? fallback.partner.description,
      logoUrl: input?.partner?.logoUrl ?? fallback.partner.logoUrl,
      conversionRate: ensureNumber(input?.partner?.conversionRate, fallback.partner.conversionRate),
      isActive: input?.partner?.isActive ?? fallback.partner.isActive,
    },
    totals: {
      transactions: ensureNumber(input?.totals?.transactions, 0),
      pendingTransactions: ensureNumber(input?.totals?.pendingTransactions, 0),
      settledTransactions: ensureNumber(input?.totals?.settledTransactions, 0),
      points: ensureNumber(input?.totals?.points, 0),
      grossAmount: ensureNumber(input?.totals?.grossAmount, 0),
      totalCommission: ensureNumber(input?.totals?.totalCommission, 0),
    },
  };
}

function normalizeCommunicationAnalytics(input: {
  total?: unknown;
  byChannel?: Record<string, unknown> | null;
  byStatus?: Record<string, unknown> | null;
} | null | undefined) {
  const fallback = createDefaultCommunicationAnalytics();
  return {
    total: ensureNumber(input?.total, 0),
    byChannel: ensureNumberRecord(input?.byChannel, fallback.byChannel),
    byStatus: ensureNumberRecord(input?.byStatus, fallback.byStatus),
    recent: [],
  };
}

function mapApiTransactionType(value: unknown): Transaction["type"] {
  const type = String(value || "").trim().toUpperCase();
  if (type === "REDEEM" || type === "REDEEMED" || type === "REWARD_REDEEMED") return "redeemed";
  if (type === "GIFT" || type === "GIFTED") return "gifted";
  if (type === "EXPIRED" || type === "EXPIRY") return "expired";
  if (type === "PENDING") return "pending";
  return "earned";
}

function transactionDate(row: Record<string, unknown>) {
  return String(row.date || row.transaction_date || row.created_at || new Date().toISOString());
}

function transactionDescription(row: Record<string, unknown>) {
  return String(row.reason || row.description || row.transaction_type || row.type || "Transaction");
}

function monthKey(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export async function loadMemberSnapshotViaApi(currentUser: MemberData): Promise<Partial<MemberData>> {
  const safeCurrentUser = createDefaultMemberData(currentUser);
  const memberId = safeCurrentUser.memberId;
  const email = safeCurrentUser.email;
  if (!memberId && !email) return {};

  const resolvedMemberId = memberId || email;
  const query = email ? `?email=${encodeURIComponent(email)}` : "";

  const [pointsResponse, historyResponse, profileResponse] = await Promise.all([
    requestJsonSafe<{
      ok: true;
      memberId: string;
      points: number;
      balance: { member_id: string; points_balance: number; tier: string };
    }>(
      `/members/${encodeURIComponent(resolvedMemberId)}/points${query}`,
      () => ({
        ok: true as const,
        memberId: resolvedMemberId,
        points: ensureNumber(safeCurrentUser.points, 0),
        balance: {
          member_id: resolvedMemberId,
          points_balance: ensureNumber(safeCurrentUser.points, 0),
          tier: safeCurrentUser.tier,
        },
      }),
    ),
    requestJsonSafe<{
      ok: true;
      memberId: string;
      history: Array<Record<string, unknown>>;
    }>(
      `/members/${encodeURIComponent(resolvedMemberId)}/points-history${query}`,
      () => ({
        ok: true as const,
        memberId: resolvedMemberId,
        history: [],
      }),
    ),
    requestJsonSafe<{
      ok: true;
      memberId: string;
      profile: Record<string, unknown>;
    }>(
      `/members/${encodeURIComponent(resolvedMemberId)}/profile${query}`,
      () => ({
        ok: true as const,
        memberId: resolvedMemberId,
        profile: {},
      }),
    ),
  ]);

  const profile = (profileResponse.data.profile || {}) as {
    id?: string;
    name?: string;
    email?: string;
    mobile?: string;
    birthdate?: string;
    address?: string;
    memberSince?: string;
    lifetimePoints?: number;
    status?: string;
    surveysCompleted?: number;
    tier?: string;
  };
  const balance = Number(
    pointsResponse.data.points ??
      pointsResponse.data.balance?.points_balance ??
      safeCurrentUser.points ??
      0,
  );
  const sortedHistory = [...ensureArray(historyResponse.data.history)].sort(
    (left, right) => new Date(transactionDate(right)).getTime() - new Date(transactionDate(left)).getTime(),
  );

  let runningBalance = balance;
  const transactions = sortedHistory.map((row, index): Transaction => {
    const signedPoints = Number(row.points || 0);
    const type = mapApiTransactionType(row.type || row.transaction_type);
    const transaction: Transaction = {
      id: String(row.id || row.transaction_id || row.reference || `${index}`),
      date: transactionDate(row),
      description: transactionDescription(row),
      type,
      points: Math.abs(signedPoints),
      balance: runningBalance,
      category: type === "redeemed" || type === "gifted" ? "Reward" : "Purchase",
      receiptId: row.receipt_id ? String(row.receipt_id) : undefined,
    };
    if (type !== "pending") runningBalance -= signedPoints;
    return transaction;
  });

  const currentMonth = monthKey(new Date());
  const earnedThisMonth = sortedHistory
    .filter((row) => mapApiTransactionType(row.type || row.transaction_type) === "earned")
    .filter((row) => monthKey(transactionDate(row)) === currentMonth)
    .reduce((sum, row) => sum + Math.max(0, Number(row.points || 0)), 0);

  const redeemedThisMonth = sortedHistory
    .filter((row) => {
      const type = mapApiTransactionType(row.type || row.transaction_type);
      return (type === "redeemed" || type === "gifted") && monthKey(transactionDate(row)) === currentMonth;
    })
    .reduce((sum, row) => sum + Math.abs(Number(row.points || 0)), 0);

  const pendingPoints = sortedHistory
    .filter((row) => mapApiTransactionType(row.type || row.transaction_type) === "pending")
    .reduce((sum, row) => sum + Math.max(0, Number(row.points || 0)), 0);

  const lifetimePoints = sortedHistory
    .filter((row) => mapApiTransactionType(row.type || row.transaction_type) === "earned")
    .reduce((sum, row) => sum + Math.max(0, Number(row.points || 0)), 0);

  const expiringRows = sortedHistory.filter((row) => {
    const expiryValue = row.expiry_date || row.expiryDate;
    if (!expiryValue) return false;
    const days = (new Date(String(expiryValue)).getTime() - Date.now()) / 86_400_000;
    return days >= 0 && days <= 30 && Number(row.points || 0) > 0;
  });
  const expiringPoints = expiringRows.reduce((sum, row) => sum + Math.max(0, Number(row.points || 0)), 0);
  const daysUntilExpiry = expiringRows.length
    ? Math.max(
        0,
        Math.min(
          ...expiringRows.map((row) =>
            Math.ceil((new Date(String(row.expiry_date || row.expiryDate)).getTime() - Date.now()) / 86_400_000),
          ),
        ),
      )
    : 0;

  return {
    memberId: String(profile.id || pointsResponse.data.balance?.member_id || safeCurrentUser.memberId),
    fullName: String(profile.name || safeCurrentUser.fullName || "Member"),
    email: String(profile.email || safeCurrentUser.email || ""),
    phone: String(profile.mobile || safeCurrentUser.phone || ""),
    birthdate: String(profile.birthdate || safeCurrentUser.birthdate || ""),
    address: String(profile.address || safeCurrentUser.address || ""),
    profileImage: safeCurrentUser.profileImage || "",
    memberSince: String(profile.memberSince || safeCurrentUser.memberSince || ""),
    points: balance,
    pendingPoints,
    lifetimePoints: Number(profile.lifetimePoints ?? lifetimePoints ?? safeCurrentUser.lifetimePoints ?? 0),
    earnedThisMonth,
    redeemedThisMonth,
    expiringPoints,
    daysUntilExpiry,
    tier: normalizeTier(profile.tier || pointsResponse.data.balance?.tier),
    status: String(profile.status || safeCurrentUser.status || "Active") === "Inactive" ? "Inactive" : "Active",
    surveysCompleted: Number(profile.surveysCompleted ?? safeCurrentUser.surveysCompleted ?? 0),
    transactions,
  };
}

export async function awardPointsViaApi(input: {
  memberIdentifier: string;
  fallbackEmail?: string;
  points: number;
  transactionType: "PURCHASE" | "MANUAL_AWARD" | "EARN";
  reason: string;
  amountSpent?: number;
  productCode?: string;
  productCategory?: string;
  transactionReference?: string;
}) {
  const { transactionReference, ...payload } = input;
  const memberIdentifier = resolveMemberIdentifier(input.memberIdentifier, input.fallbackEmail);
  return requestJson<{
    ok: true;
    result: {
      newBalance: number;
      newTier: string;
      pointsAdded: number;
      bonusPointsAdded: number;
      appliedCampaigns: Array<Record<string, unknown>>;
    };
    replayed: boolean;
  }>("/points/award", {
    method: "POST",
    body: JSON.stringify({ ...payload, memberIdentifier }),
    idempotencyKey: transactionReference || createIdempotencyKey("points-award"),
  });
}

export async function recordTransactionCompletedViaApi(input: {
  eventId?: string;
  transactionReference: string;
  memberIdentifier: string;
  fallbackEmail?: string;
  amountSpent: number;
  reason?: string;
  productCode?: string;
  productCategory?: string;
}) {
  const memberIdentifier = resolveMemberIdentifier(input.memberIdentifier, input.fallbackEmail);
  return requestJson<{
    ok: true;
    result: unknown;
    replayed: boolean;
  }>("/events/transaction-completed", {
    method: "POST",
    body: JSON.stringify({
      eventType: "transaction.completed",
      ...input,
      memberIdentifier,
    }),
  });
}

export async function redeemPointsViaApi(input: {
  memberIdentifier: string;
  fallbackEmail?: string;
  points: number;
  reason: string;
  transactionType?: "REDEEM" | "GIFT";
  rewardCatalogId?: string | number | null;
  promotionCampaignId?: string | null;
}) {
  const memberIdentifier = resolveMemberIdentifier(input.memberIdentifier, input.fallbackEmail);
  return requestJson<{
    ok: true;
    result: {
      newBalance: number;
      newTier: string;
      pointsDeducted: number;
    };
  }>("/points/redeem", {
    method: "POST",
    body: JSON.stringify({ ...input, memberIdentifier }),
  });
}

export async function saveCampaignViaApi(input: Record<string, unknown>) {
  return requestJson<{ ok: true; campaign: PromotionCampaign }>("/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function publishCampaignViaApi(campaignId: string, queueNotifications = false) {
  return requestJson<{ ok: true; campaign: PromotionCampaign; notificationsQueued: number }>(
    `/campaigns/${campaignId}/publish`,
    {
      method: "PATCH",
      body: JSON.stringify({ queueNotifications }),
    },
  );
}

export async function loadActiveCampaignsViaApi(tier?: string) {
  const params = new URLSearchParams();
  if (tier) params.set("tier", tier);
  const query = params.toString();
  const response = await requestJsonSafe<{
    ok?: boolean;
    campaigns: Array<
      PromotionCampaign & {
        budgetUtilizationPercent: number;
        trackedTransactions: number;
        pointsAwarded: number;
        notificationsSent: number;
      }
    >;
  }>(
    `/campaigns/active${query ? `?${query}` : ""}`,
    () => ({
      campaigns: [],
    }),
  );
  return {
    ok: response.ok,
    error: response.ok ? undefined : response.error,
    campaigns: ensureArray(response.data.campaigns),
  };
}

export async function loadCampaignBudgetStatusViaApi(campaignId: string) {
  return requestJson<{
    ok: true;
    budgetStatus: {
      campaignId: string;
      status: string;
      active: boolean;
      budgetLimit: number | null;
      budgetSpent: number;
      budgetRemaining: number | null;
      utilizationPercent: number;
      trackedTransactions: number;
      pointsAwarded: number;
      notificationsSent: number;
      redemptionCount: number;
      quantityLimit: number | null;
      quantityClaimed: number;
      sellThrough: number | null;
    };
  }>(`/campaigns/${campaignId}/budget-status`);
}

export async function saveSegmentViaApi(input: {
  id?: string;
  name: string;
  description?: string;
  logicMode?: "AND" | "OR";
  conditions?: Array<{ id: string; field: "Tier" | "Last Activity" | "Points Balance"; operator: string; value: string }>;
}) {
  return requestJson<{
    ok: true;
    segment: { id: string; name: string; description: string | null };
    preview?: {
      count: number;
      members: Array<{
        id: string;
        memberNumber: string;
        fullName: string;
        email: string;
        tier: string;
        pointsBalance: number;
        lastActivityAt: string | null;
      }>;
    } | null;
  }>(
    "/segments",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function listSegmentsViaApi() {
  const response = await requestJsonSafe<{
    ok?: boolean;
    segments: Array<{ id: string; name: string; description: string | null; is_system: boolean }>;
    source?: string;
  }>(
    "/segments",
    () => ({
      segments: DEFAULT_SEGMENTS,
      source: "fallback",
    }),
  );
  return {
    ok: response.ok,
    error: response.ok ? undefined : response.error,
    segments: ensureArray(response.data.segments),
    source: response.data.source,
  };
}

export async function previewSegmentViaApi(input: {
  logicMode: "AND" | "OR";
  conditions: Array<{ id: string; field: "Tier" | "Last Activity" | "Points Balance"; operator: string; value: string }>;
}) {
  const response = await requestJsonSafe<{
    ok?: boolean;
    preview: {
      count: number;
      members: Array<{
        id: string;
        memberNumber: string;
        fullName: string;
        email: string;
        tier: string;
        pointsBalance: number;
        lastActivityAt: string | null;
      }>;
    };
  }>(
    "/segments/preview",
    () => ({
      preview: {
        count: 0,
        members: [],
      },
    }),
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return {
    ok: response.ok,
    error: response.ok ? undefined : response.error,
    preview: {
      count: ensureNumber(response.data.preview?.count, 0),
      members: ensureArray(response.data.preview?.members),
    },
  };
}

export async function triggerSmsViaApi(input: {
  subject: string;
  message: string;
  trigger?: string;
  segment?: string;
  memberId?: string;
  email?: string;
  phone?: string;
}) {
  return requestJson<{ ok: true; result: Record<string, unknown> }>("/notifications/sms", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function scheduleEmailViaApi(input: {
  subject: string;
  message: string;
  segment?: string;
  memberId?: string;
  email?: string;
  scheduledFor?: string;
}) {
  return requestJson<{ ok: true; result: Record<string, unknown> }>("/communications/email", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function loadNotificationsViaApi(input: {
  memberId?: string;
  email?: string;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (input.memberId) params.set("memberId", input.memberId);
  if (input.email) params.set("email", input.email);
  if (input.limit) params.set("limit", String(input.limit));

  const response = await requestJsonSafe<{ ok?: boolean; notifications?: AppNotification[] }>(
    `/notifications${params.toString() ? `?${params.toString()}` : ""}`,
    () => ({
      notifications: DEFAULT_NOTIFICATIONS,
    }),
  );
  return {
    ok: response.ok,
    error: response.ok ? undefined : response.error,
    notifications: ensureArray(response.data.notifications).map((item) => normalizeNotification(item)),
  };
}

export async function markNotificationReadViaApi(id: string) {
  return requestJson<{ ok: true }>(`/notifications/${id}/read`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
}

export async function unsubscribeEmailViaApi(input: { memberId?: string; email?: string }) {
  return requestJson<{ ok: true }>("/unsubscribe", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function loadCommunicationAnalyticsViaApi() {
  const response = await requestJsonSafe<{
    ok?: boolean;
    analytics: {
      total: number;
      byChannel: Record<string, number>;
      byStatus: Record<string, number>;
    };
  }>(
    "/communications/analytics",
    () => ({
      analytics: createDefaultCommunicationAnalytics(),
    }),
  );
  return {
    ok: response.ok,
    error: response.ok ? undefined : response.error,
    analytics: normalizeCommunicationAnalytics(response.data.analytics),
  };
}

export async function loadCommunicationOutboxViaApi() {
  return requestJson<{
    ok: true;
    outbox: Array<{
      id: string;
      type: string;
      channel: string;
      recipient: string | null;
      subject: string | null;
      message: string;
      status: string;
      mode: string;
      createdAt: string;
    }>;
    mode?: string;
  }>("/communications/outbox");
}

export async function loadTierRulesViaApi() {
  const response = await requestJsonSafe<{
    ok?: boolean;
    tiers: Array<{ tier_label: string; min_points: number; is_active?: boolean }>;
    earningRules: Array<{ tier_label: string; peso_per_point: number; multiplier: number; is_active?: boolean }>;
    mode?: string;
  }>(
    "/tiers/rules",
    () => ({
      tiers: DEFAULT_TIER_RULES,
      earningRules: DEFAULT_EARNING_RULES,
      mode: "fallback",
    }),
  );
  return {
    ok: response.ok,
    error: response.ok ? undefined : response.error,
    tiers: ensureArray(response.data.tiers),
    earningRules: ensureArray(response.data.earningRules),
    mode: response.data.mode,
  };
}

export async function saveTierRulesViaApi(input: {
  tiers: Array<{ tier_label: string; min_points: number; is_active?: boolean }>;
  earningRules: Array<{ tier_label: string; peso_per_point: number; multiplier: number; is_active?: boolean }>;
}) {
  return requestJson<{
    ok: true;
    tiers: Array<{ tier_label: string; min_points: number; is_active?: boolean }>;
    earningRules: Array<{ tier_label: string; peso_per_point: number; multiplier: number; is_active?: boolean }>;
    mode?: string;
  }>("/tiers/rules", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function recalculateTiersViaApi() {
  return requestJson<{ ok: true; updatedMembers: number; mode?: string }>("/tiers/recalculate", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function createPurchaseViaApi(input: {
  memberId: string;
  email?: string;
  receiptReference: string;
  amount: number;
  date: string;
  category: string;
  notes?: string;
}) {
  return requestJson<{
    ok: true;
    purchase: Record<string, unknown>;
    award: { pointsAwarded: number; newBalance: number; tier: string };
    mode?: string;
  }>("/purchases", {
    method: "POST",
    body: JSON.stringify(input),
    idempotencyKey: input.receiptReference,
  });
}

export async function loadPurchasesViaApi(memberId: string) {
  const response = await requestJsonSafe<{ ok?: boolean; purchases?: Array<Record<string, unknown>> }>(
    `/purchases?memberId=${encodeURIComponent(memberId)}`,
    () => ({
      purchases: [],
    }),
  );
  return {
    ok: response.ok,
    error: response.ok ? undefined : response.error,
    purchases: ensureArray(response.data.purchases),
  };
}

export async function loadTasksViaApi(memberId: string) {
  const response = await requestJsonSafe<{
    ok?: boolean;
    tasks?: Array<Record<string, unknown>>;
    source?: string;
  }>(
    `/tasks?memberId=${encodeURIComponent(memberId)}`,
    () => ({
      tasks: [],
      source: "fallback",
    }),
  );
  return {
    ok: response.ok,
    error: response.ok ? undefined : response.error,
    tasks: ensureArray(response.data.tasks),
    source: response.data.source,
  };
}

export async function startTaskViaApi(taskId: string, input: { memberId: string }) {
  return requestJson<{ ok: true; taskId: string; memberId: string; status: string }>(
    `/tasks/${encodeURIComponent(taskId)}/start`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function submitTaskViaApi(
  taskId: string,
  input: {
    memberId: string;
    email?: string;
    title?: string;
    description?: string;
    type?: string;
    points?: number;
    requiredFields?: string[];
    answers: Record<string, string>;
  },
) {
  return requestJson<{
    ok: true;
    taskId: string;
    memberId: string;
    status: string;
    award: { pointsAwarded: number; newBalance: number; tier: string };
  }>(`/tasks/${encodeURIComponent(taskId)}/submit`, {
    method: "POST",
    body: JSON.stringify(input),
    idempotencyKey: `task-${taskId}-${input.memberId}`,
  });
}

export async function createReferralViaApi(input: {
  memberId: string;
  recipientEmail: string;
  referralLink?: string;
}) {
  return requestJson<{
    ok: true;
    referral: Record<string, unknown>;
    mode?: string;
  }>("/referrals", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function loadReferralsViaApi(memberId: string) {
  return requestJson<{ ok: true; referrals: Array<Record<string, unknown>> }>(
    `/referrals?memberId=${encodeURIComponent(memberId)}`,
  );
}

export async function recordPartnerTransactionViaApi(input: {
  partnerId: string;
  partnerCode: string;
  partnerName: string;
  memberId: string;
  memberEmail?: string;
  orderId: string;
  points: number;
  grossAmount: number;
  note?: string;
}) {
  return requestJson("/partners/transactions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function loadPartnerDashboardViaApi() {
  const response = await requestJsonSafe<{
    ok?: boolean;
    partners?: Array<{
      partner: {
        id: string;
        partnerCode: string;
        partnerName: string;
        description: string | null;
        logoUrl: string | null;
        conversionRate: number;
        isActive: boolean;
      };
      totals: {
        transactions: number;
        pendingTransactions: number;
        settledTransactions: number;
        points: number;
        grossAmount: number;
        totalCommission: number;
      };
    }>;
    dashboard?: {
      partnerId?: string;
      summary?: {
        transactionCount?: number;
        totalTransactionAmount?: number;
        settlementCount?: number;
        pendingSettlementAmount?: number;
        paidSettlementAmount?: number;
      };
    };
  }>(
    "/partners/dashboard",
    () => ({
      partners: [],
      dashboard: {
        partnerId: "all",
        summary: {},
      },
    }),
  );
  if (Array.isArray(response.data.partners) && response.data.partners.length > 0) {
    return {
      ok: response.ok,
      error: response.ok ? undefined : response.error,
      partners: response.data.partners.map((row) => normalizePartnerDashboardRow(row)),
    };
  }

  const summary = response.data.dashboard?.summary || {};
  const fallbackPartner = createDefaultPartnerDashboardRow("All Partners");
  return {
    ok: response.ok,
    error: response.ok ? undefined : response.error,
    partners: [
      {
        partner: {
          ...fallbackPartner.partner,
          id: String(response.data.dashboard?.partnerId || fallbackPartner.partner.id),
          partnerCode: String(response.data.dashboard?.partnerId || fallbackPartner.partner.partnerCode),
        },
        totals: {
          transactions: Number(summary.transactionCount || 0),
          pendingTransactions: Number(summary.settlementCount || 0),
          settledTransactions: Number(summary.paidSettlementAmount || 0),
          points: fallbackPartner.totals.points,
          grossAmount: Number(summary.totalTransactionAmount || 0),
          totalCommission: Number(summary.pendingSettlementAmount || 0),
        },
      },
    ],
  };
}

export async function loadPartnerDashboardByIdViaApi(partnerId: string) {
  return requestJson<{
    ok: true;
    dashboard: {
      partner: {
        id: string;
        partnerCode: string;
        partnerName: string;
        description: string | null;
        logoUrl: string | null;
        conversionRate: number;
        isActive: boolean;
      };
      totals: {
        transactions: number;
        pendingTransactions: number;
        settledTransactions: number;
        points: number;
        grossAmount: number;
        totalCommission: number;
      };
      settlements: Array<Record<string, unknown>>;
      recentTransactions: Array<Record<string, unknown>>;
    };
  }>(`/partners/${partnerId}/dashboard`);
}

export async function triggerPartnerSettlementViaApi(partnerId?: string, month?: string) {
  if (partnerId && month) {
    return requestJson<{
      ok: true;
      settlement: {
        id: string;
        partnerId: string;
        partnerName: string;
        month: string;
        commissionAmount: number;
      };
    }>(`/partners/${partnerId}/settlement?month=${encodeURIComponent(month)}`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  return requestJson<{
    ok: true;
    settlement: {
      id: string;
      partnerId: string;
      partnerName: string;
      month?: string;
      commissionAmount: number;
    };
  }>("/partners/settlements", {
    method: "POST",
    body: JSON.stringify({ partnerId, month }),
  });
}

export async function markPartnerSettlementPaidViaApi(partnerId: string, month: string) {
  return requestJson<{ ok: true; settlement: Record<string, unknown> }>(
    `/partners/${partnerId}/settlement/${encodeURIComponent(month)}/paid`,
    {
      method: "PATCH",
      body: JSON.stringify({}),
    },
  );
}
