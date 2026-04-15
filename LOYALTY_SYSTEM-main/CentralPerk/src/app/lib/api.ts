import type { PromotionCampaign } from "./promotions";
import type { AppNotification } from "./notifications";

export async function requestJson<TResponse = unknown>(
  url: string,
  init?: RequestInit & { idempotencyKey?: string },
): Promise<TResponse> {
  const headers = new Headers(init?.headers ?? {});
  headers.set("Content-Type", "application/json");
  if (init?.idempotencyKey) {
    headers.set("Idempotency-Key", init.idempotencyKey);
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((payload as { error?: unknown }).error || `Request failed (${response.status}).`));
  }

  return payload as TResponse;
}

export function createIdempotencyKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
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
}): Promise<{
  ok: true;
  result: {
    newBalance: number;
    newTier: string;
    pointsAdded: number;
    bonusPointsAdded: number;
    appliedCampaigns: Array<Record<string, unknown>>;
    duplicate?: boolean;
    idempotencyKey?: string | null;
  };
  replayed: boolean;
}> {
  const idempotencyKey = createIdempotencyKey("points-award");
  const response = await requestJson<{
    ok?: true;
    result?: {
      newBalance: number;
      newTier: string;
      pointsAdded: number;
      bonusPointsAdded: number;
      appliedCampaigns: Array<Record<string, unknown>>;
      duplicate?: boolean;
      idempotencyKey?: string | null;
    };
    replayed?: boolean;
    newBalance?: number;
    newTier?: string;
    pointsAdded?: number;
    bonusPointsAdded?: number;
    appliedCampaigns?: Array<Record<string, unknown>>;
    duplicate?: boolean;
    idempotencyKey?: string | null;
  }>("/api/points/award", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      idempotencyKey,
    }),
    idempotencyKey,
  });

  if (response.result) {
    return {
      ok: true as const,
      result: response.result,
      replayed: Boolean(response.replayed ?? response.result.duplicate ?? false),
    };
  }

  return {
    ok: true as const,
    result: {
      newBalance: Number(response.newBalance ?? 0),
      newTier: String(response.newTier ?? "Bronze"),
      pointsAdded: Number(response.pointsAdded ?? 0),
      bonusPointsAdded: Number(response.bonusPointsAdded ?? 0),
      appliedCampaigns: Array.isArray(response.appliedCampaigns) ? response.appliedCampaigns : [],
      duplicate: Boolean(response.duplicate ?? false),
      idempotencyKey: response.idempotencyKey ?? idempotencyKey,
    },
    replayed: Boolean(response.duplicate ?? false),
  };
}

export async function redeemPointsViaApi(input: {
  memberIdentifier: string;
  fallbackEmail?: string;
  points: number;
  reason: string;
  transactionType?: "REDEEM" | "GIFT";
  rewardCatalogId?: string | number | null;
  promotionCampaignId?: string | null;
}): Promise<{
  ok: true;
  result: {
    newBalance: number;
    newTier: string;
    pointsDeducted: number;
    duplicate?: boolean;
    idempotencyKey?: string | null;
  };
}> {
  const idempotencyKey = createIdempotencyKey("points-redeem");
  const response = await requestJson<{
    ok?: true;
    result?: {
      newBalance: number;
      newTier: string;
      pointsDeducted: number;
      duplicate?: boolean;
      idempotencyKey?: string | null;
    };
    newBalance?: number;
    newTier?: string;
    pointsDeducted?: number;
    duplicate?: boolean;
    idempotencyKey?: string | null;
  }>("/api/points/redeem", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      idempotencyKey,
    }),
    idempotencyKey,
  });

  if (response.result) {
    return {
      ok: true as const,
      result: response.result,
    };
  }

  return {
    ok: true as const,
    result: {
      newBalance: Number(response.newBalance ?? 0),
      newTier: String(response.newTier ?? "Bronze"),
      pointsDeducted: Number(response.pointsDeducted ?? 0),
      duplicate: Boolean(response.duplicate ?? false),
      idempotencyKey: response.idempotencyKey ?? idempotencyKey,
    },
  };
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

export async function triggerPartnerSettlementViaApi(partnerId?: string) {
  return requestJson<{
    ok: true;
    settlement: {
      id: string;
      partnerId: string;
      partnerName: string;
      commissionAmount: number;
    };
  }>("/api/partners/settlements", {
    method: "POST",
    body: JSON.stringify({ partnerId }),
  });
}
