import type { MemberData, Transaction } from "../types/loyalty";
import type { PromotionCampaign } from "./promotions";
import type { AppNotification } from "./notifications";
import { API_BASE_URL, apiUrl, BACKEND_OFFLINE_MESSAGE } from "./api-config";

export { API_BASE_URL, apiUrl, BACKEND_OFFLINE_MESSAGE };

const GET_CACHE_TTL_MS = 20_000;
const REQUEST_TIMEOUT_MS = 8_000;
const getCache = new Map<string, { loadedAt: number; payload: unknown }>();
const getInFlight = new Map<string, Promise<unknown>>();
const HTML_RESPONSE_MARKERS = ["<!DOCTYPE html", "__next/static", "<html"];

function withApiLabel<T>(promise: Promise<T>, label: string): Promise<T> {
  return promise.catch((error) => {
    const message =
      error instanceof Error && error.message
        ? error.message
        : `Failed to load ${label}.`;
    throw new Error(message.includes("Failed to load") ? message : `Failed to load ${label}: ${message}`);
  });
}

export async function requestJson<TResponse = unknown>(
  url: string,
  init?: RequestInit & { idempotencyKey?: string },
): Promise<TResponse> {
  const method = String(init?.method || "GET").toUpperCase();
  const isGet = method === "GET";
  const resolvedUrl = apiUrl(url);
  const now = Date.now();

  if (isGet) {
    const cached = getCache.get(resolvedUrl);
    if (cached && now - cached.loadedAt < GET_CACHE_TTL_MS) return cached.payload as TResponse;

    const inFlight = getInFlight.get(resolvedUrl);
    if (inFlight) return inFlight as Promise<TResponse>;
  }

  const headers = new Headers(init?.headers ?? {});
  headers.set("Content-Type", "application/json");
  if (init?.idempotencyKey) {
    headers.set("Idempotency-Key", init.idempotencyKey);
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  init?.signal?.addEventListener("abort", () => controller.abort(), { once: true });
  const startedAt = performance.now();

  const request = fetch(resolvedUrl, {
    cache: init?.cache ?? "no-store",
    ...init,
    headers,
    signal: controller.signal,
  })
    .then(async (response) => {
      const raw = await response.text();
      const elapsedMs = Math.round(performance.now() - startedAt);
      if (elapsedMs > 800) {
        console.info(`[api] ${method} ${resolvedUrl} ${response.status} in ${elapsedMs}ms`);
      }
      if (HTML_RESPONSE_MARKERS.some((marker) => raw.includes(marker))) {
        throw new Error(
          `Received HTML instead of backend JSON from ${resolvedUrl}. Check NEXT_PUBLIC_API_BASE_URL and point the app to ${API_BASE_URL}.`,
        );
      }
      const payload = raw ? JSON.parse(raw) : {};
      if (!response.ok) {
        throw new Error(String((payload as { error?: unknown }).error || `Request failed (${response.status}).`));
      }
      if (isGet) {
        getCache.set(resolvedUrl, { loadedAt: Date.now(), payload });
      } else {
        getCache.clear();
      }
      return payload as TResponse;
    })
    .catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(`API request timed out after ${REQUEST_TIMEOUT_MS / 1000}s. Check the backend at ${resolvedUrl}.`);
      }
      if (error instanceof TypeError) {
        throw new Error(BACKEND_OFFLINE_MESSAGE);
      }
      throw error;
    })
    .finally(() => {
      globalThis.clearTimeout(timeout);
      if (isGet) getInFlight.delete(resolvedUrl);
    });

  if (isGet) getInFlight.set(resolvedUrl, request);
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
    withApiLabel(
      requestJson<{
      ok: true;
      memberId: string;
      points: number;
      balance: { member_id: string; points_balance: number; tier: string };
      }>(`/members/${encodeURIComponent(resolvedMemberId)}/points${query}`),
      "points API",
    ),
    withApiLabel(
      requestJson<{
      ok: true;
      memberId: string;
      history: Array<Record<string, unknown>>;
      }>(`/members/${encodeURIComponent(resolvedMemberId)}/points-history${query}`),
      "points history API",
    ),
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
  return withApiLabel(
    requestJson<{
      ok: true;
      campaigns: Array<
        PromotionCampaign & {
          budgetUtilizationPercent: number;
          trackedTransactions: number;
          pointsAwarded: number;
          notificationsSent: number;
        }
      >;
    }>(`/campaigns/active${query ? `?${query}` : ""}`),
    "campaigns API",
  );
}

export async function loadCampaignBudgetStatusViaApi(campaignId: string) {
  return withApiLabel(
    requestJson<{
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
    }>(`/campaigns/${campaignId}/budget-status`),
    "campaign budget API",
  );
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
  return withApiLabel(
    requestJson<{
    ok: true;
    segments: Array<{ id: string; name: string; description: string | null; is_system: boolean }>;
    source?: string;
    }>("/segments"),
    "segments API",
  );
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
  }>("/segments/preview", {
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
  return requestJson<{ ok: true; queued: number }>("/notifications/sms", {
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
  return requestJson<{ ok: true; queued: number; scheduledFor: string | null }>("/communications/email", {
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

  return withApiLabel(
    requestJson<{ ok: true; notifications: AppNotification[] }>(
      `/notifications${params.toString() ? `?${params.toString()}` : ""}`,
    ),
    "notifications API",
  );
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
  return withApiLabel(
    requestJson<{
    ok: true;
    analytics: {
      total: number;
      byChannel: Record<string, number>;
      byStatus: Record<string, number>;
    };
    }>("/communications/analytics"),
    "communications analytics API",
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
  return withApiLabel(
    requestJson<{
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
    }>("/partners/dashboard"),
    "partners dashboard API",
  );
}

export async function loadPartnerDashboardByIdViaApi(partnerId: string) {
  return withApiLabel(
    requestJson<{
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
    }>(`/partners/${partnerId}/dashboard`),
    "partner detail API",
  );
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
