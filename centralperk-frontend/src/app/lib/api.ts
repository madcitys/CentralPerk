import type { PromotionCampaign } from "./promotions";
import type { AppNotification } from "./notifications";
import type { Reward } from "../types/loyalty";
import type { RedemptionVoucher } from "../types/voucher";
import { normalizeRewardDescription, normalizeRewardDisplayName, normalizeRewardImageUrl } from "./reward-display";

type AnyRecord = Record<string, unknown>;

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
    const errorPayload = (payload as { error?: unknown; message?: unknown }).error;
    const message =
      typeof errorPayload === "string"
        ? errorPayload
        : errorPayload && typeof errorPayload === "object" && typeof (errorPayload as { message?: unknown }).message === "string"
          ? (errorPayload as { message: string }).message
          : typeof (payload as { message?: unknown }).message === "string"
            ? String((payload as { message: unknown }).message)
            : `Request failed (${response.status}).`;
    throw new Error(message);
  }

  return payload as TResponse;
}

export function createIdempotencyKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function normalizeMemberIdentifier(memberIdentifier?: string, fallbackEmail?: string) {
  const normalizedMemberIdentifier = memberIdentifier?.trim();
  if (normalizedMemberIdentifier) return normalizedMemberIdentifier;

  const normalizedFallbackEmail = fallbackEmail?.trim();
  if (normalizedFallbackEmail) return normalizedFallbackEmail;

  throw new Error("Missing member identifier. Refresh the page and try again.");
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
  const memberIdentifier = normalizeMemberIdentifier(input.memberIdentifier, input.fallbackEmail);
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
      memberIdentifier,
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
  const memberIdentifier = normalizeMemberIdentifier(input.memberIdentifier, input.fallbackEmail);
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
      memberIdentifier,
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

export async function redeemRewardViaApi(input: {
  memberIdentifier: string;
  fallbackEmail?: string;
  points: number;
  reason: string;
  rewardCatalogId: string | number;
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
  warning?: string | null;
}> {
  const idempotencyKey = createIdempotencyKey("reward-redeem");
  const memberIdentifier = normalizeMemberIdentifier(input.memberIdentifier, input.fallbackEmail);
  const response = await requestJson<{
    ok?: true;
    points?: {
      newBalance?: number;
      newTier?: string;
      pointsDeducted?: number;
      duplicate?: boolean;
      idempotencyKey?: string | null;
    };
    result?: {
      newBalance?: number;
      newTier?: string;
      pointsDeducted?: number;
      duplicate?: boolean;
      idempotencyKey?: string | null;
    };
    warning?: string | null;
  }>("/api/rewards/redeem", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      memberIdentifier,
      idempotencyKey,
    }),
    idempotencyKey,
  });

  const result = response.points ?? response.result ?? {};
  return {
    ok: true as const,
    result: {
      newBalance: Number(result.newBalance ?? 0),
      newTier: String(result.newTier ?? "Bronze"),
      pointsDeducted: Number(result.pointsDeducted ?? input.points),
      duplicate: Boolean(result.duplicate ?? false),
      idempotencyKey: result.idempotencyKey ?? idempotencyKey,
    },
    warning: response.warning ?? null,
  };
}

export async function loadPointsLedgerViaApi(limit = 1000) {
  const params = new URLSearchParams({ limit: String(limit) });
  return requestJson<{
    ok: true;
    transactions: Array<{
      id?: string | number;
      member_id: string | number;
      transaction_id?: string | number;
      transaction_type: string;
      points: number;
      balance?: number | null;
      transaction_date: string;
      expiry_date?: string | null;
      reason?: string | null;
      reward_catalog_id?: number | string | null;
      promotion_campaign_id?: string | null;
    }>;
  }>(`/api/points/ledger?${params.toString()}`);
}

export async function saveCampaignViaApi(input: Record<string, unknown>) {
  return requestJson<{ ok: true; campaign: PromotionCampaign }>("/api/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function loadRewardsViaApi() {
  const response = await requestJson<{
    ok: true;
    rewards: AnyRecord[];
  }>("/api/rewards");

  return {
    ...response,
    rewards: (response.rewards || []).map((reward) => {
      const rawName = String(reward.name ?? "Reward");
      const rawDescription = String(reward.description ?? "");
      return {
        id: String(reward.reward_id ?? reward.id ?? ""),
        rewardCatalogId: reward.id ? String(reward.id) : undefined,
        name: normalizeRewardDisplayName(rawName),
        description: normalizeRewardDescription(rawName, rawDescription),
        pointsCost: Number(reward.points_cost ?? 0),
        category: String(reward.category ?? "voucher") as Reward["category"],
        imageUrl: normalizeRewardImageUrl(rawName, reward.image_url ? String(reward.image_url) : undefined),
        available: Boolean(reward.is_active ?? true),
        expiryDate: reward.expiry_date ? String(reward.expiry_date) : undefined,
        partnerId: reward.partner_id ? String(reward.partner_id) : null,
        partnerName: reward.partner_name ? String(reward.partner_name) : null,
        partnerCode: reward.partner_code ? String(reward.partner_code) : null,
        partnerLogoUrl: reward.partner_logo_url ? String(reward.partner_logo_url) : null,
        partnerConversionRate:
          reward.partner_conversion_rate === null || reward.partner_conversion_rate === undefined
            ? null
            : Number(reward.partner_conversion_rate),
        cashValue: reward.cash_value === null || reward.cash_value === undefined ? null : Number(reward.cash_value),
        activeFlashSaleId: null,
        flashSaleStartsAt: null,
        flashSaleEndsAt: null,
        flashSaleQuantityLimit: null,
        flashSaleClaimedCount: 0,
        flashSaleBanner: null,
        flashSaleCountdownLabel: null,
      };
    }),
  };
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
  fulfillmentMethod?: "in-store" | "online";
  deliveryPartner?: string | null;
  deliveryAddress?: string | null;
  deliveryNotes?: string | null;
  contactNumber?: string | null;
}) {
  return requestJson("/api/partners/transactions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createVoucherViaApi(input: RedemptionVoucher) {
  return requestJson<{ ok: true; voucher: RedemptionVoucher }>("/api/vouchers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function loadVouchersViaApi(input: {
  memberId?: string;
  email?: string;
}) {
  const params = new URLSearchParams();
  if (input.memberId) params.set("memberId", input.memberId);
  if (input.email) params.set("email", input.email);

  return requestJson<{ ok: true; vouchers: RedemptionVoucher[] }>(
    `/api/vouchers${params.toString() ? `?${params.toString()}` : ""}`,
  );
}

export async function loadVoucherViaApi(voucherId: string) {
  return requestJson<{ ok: true; voucher: RedemptionVoucher }>(`/api/vouchers/${voucherId}`);
}

export async function validateVoucherViaApi(voucherId: string, voucherCode: string) {
  return requestJson<{ ok: true; voucher: RedemptionVoucher }>(`/api/vouchers/${voucherId}`, {
    method: "PATCH",
    body: JSON.stringify({
      action: "validate",
      voucherCode,
    }),
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
