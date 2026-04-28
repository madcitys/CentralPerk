import type { MemberData, Transaction } from "../types/loyalty";
import type { PromotionCampaign } from "./promotions";
import type { AppNotification } from "./notifications";

const GET_CACHE_TTL_MS = 20_000;
const getCache = new Map<string, { loadedAt: number; payload: unknown }>();
const getInFlight = new Map<string, Promise<unknown>>();

export async function requestJson<TResponse = unknown>(
  url: string,
  init?: RequestInit & { idempotencyKey?: string },
): Promise<TResponse> {
  const method = String(init?.method || "GET").toUpperCase();
  const isGet = method === "GET";
  const now = Date.now();

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
  if (tier === "gold") return "Gold";
  if (tier === "silver") return "Silver";
  return "Bronze";
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
  const memberId = currentUser.memberId;
  const email = currentUser.email;
  if (!memberId && !email) return {};

  const resolvedMemberId = memberId || email;
  const query = email ? `?email=${encodeURIComponent(email)}` : "";

  const [pointsResponse, historyResponse] = await Promise.all([
    requestJson<{
      ok: true;
      memberId: string;
      points: number;
      balance: { member_id: string; points_balance: number; tier: string };
    }>(`/api/members/${encodeURIComponent(resolvedMemberId)}/points${query}`),
    requestJson<{
      ok: true;
      memberId: string;
      history: Array<Record<string, unknown>>;
    }>(`/api/members/${encodeURIComponent(resolvedMemberId)}/points-history${query}`),
  ]);

  const balance = Number(pointsResponse.points ?? pointsResponse.balance?.points_balance ?? currentUser.points ?? 0);
  const sortedHistory = [...(historyResponse.history || [])].sort(
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
    memberId: String(pointsResponse.balance?.member_id || currentUser.memberId),
    fullName: currentUser.fullName,
    email: currentUser.email,
    phone: currentUser.phone || "",
    birthdate: currentUser.birthdate,
    profileImage: currentUser.profileImage || "",
    memberSince: currentUser.memberSince,
    points: balance,
    pendingPoints,
    lifetimePoints,
    earnedThisMonth,
    redeemedThisMonth,
    expiringPoints,
    daysUntilExpiry,
    tier: normalizeTier(pointsResponse.balance?.tier),
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
  }>("/api/points/award", {
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
  }>("/api/events/transaction-completed", {
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
  }>("/api/points/redeem", {
    method: "POST",
    body: JSON.stringify({ ...input, memberIdentifier }),
  });
}

export async function saveCampaignViaApi(input: Record<string, unknown>) {
  return requestJson<{ ok: true; campaign: PromotionCampaign }>("/api/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function publishCampaignViaApi(campaignId: string, queueNotifications = false) {
  return requestJson<{ ok: true; campaign: PromotionCampaign; notificationsQueued: number }>(
    `/api/campaigns/${campaignId}/publish`,
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
  return requestJson<{
    ok: true;
    campaigns: Array<
      PromotionCampaign & {
        budgetUtilizationPercent: number;
        trackedTransactions: number;
        pointsAwarded: number;
        notificationsSent: number;
      }
    >;
  }>(`/api/campaigns/active${query ? `?${query}` : ""}`);
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
  }>(`/api/campaigns/${campaignId}/budget-status`);
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
    "/api/segments",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function listSegmentsViaApi() {
  return requestJson<{
    ok: true;
    segments: Array<{ id: string; name: string; description: string | null; is_system: boolean }>;
    source?: string;
  }>("/api/segments");
}

export async function previewSegmentViaApi(input: {
  logicMode: "AND" | "OR";
  conditions: Array<{ id: string; field: "Tier" | "Last Activity" | "Points Balance"; operator: string; value: string }>;
}) {
  return requestJson<{
    ok: true;
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
  }>("/api/segments/preview", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function triggerSmsViaApi(input: {
  subject: string;
  message: string;
  trigger?: string;
  segment?: string;
  memberId?: string;
  email?: string;
}) {
  return requestJson<{ ok: true; queued: number }>("/api/notifications/sms", {
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
  return requestJson<{ ok: true; queued: number; scheduledFor: string | null }>("/api/communications/email", {
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

  return requestJson<{ ok: true; notifications: AppNotification[] }>(
    `/api/notifications${params.toString() ? `?${params.toString()}` : ""}`,
  );
}

export async function markNotificationReadViaApi(id: string) {
  return requestJson<{ ok: true }>(`/api/notifications/${id}/read`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
}

export async function unsubscribeEmailViaApi(input: { memberId?: string; email?: string }) {
  return requestJson<{ ok: true }>("/api/unsubscribe", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function loadCommunicationAnalyticsViaApi() {
  return requestJson<{
    ok: true;
    analytics: {
      total: number;
      byChannel: Record<string, number>;
      byStatus: Record<string, number>;
    };
  }>("/api/communications/analytics");
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
  return requestJson("/api/partners/transactions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function loadPartnerDashboardViaApi() {
  return requestJson<{
    ok: true;
    partners: Array<{
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
  }>("/api/partners/dashboard");
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
  }>(`/api/partners/${partnerId}/dashboard`);
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
    }>(`/api/partners/${partnerId}/settlement?month=${encodeURIComponent(month)}`, {
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
  }>("/api/partners/settlements", {
    method: "POST",
    body: JSON.stringify({ partnerId, month }),
  });
}

export async function markPartnerSettlementPaidViaApi(partnerId: string, month: string) {
  return requestJson<{ ok: true; settlement: Record<string, unknown> }>(
    `/api/partners/${partnerId}/settlement/${encodeURIComponent(month)}/paid`,
    {
      method: "PATCH",
      body: JSON.stringify({}),
    },
  );
}
