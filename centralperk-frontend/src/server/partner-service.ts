import { HttpError } from "./http-error";
import { serviceBaseUrl } from "./service-proxy";

export type PartnerTransactionRecord = {
  id: string;
  partnerId: string;
  partnerCode: string;
  partnerName: string;
  memberId: string;
  memberEmail: string | null;
  orderId: string;
  points: number;
  grossAmount: number;
  note: string;
  fulfillmentMethod: "in-store" | "online";
  deliveryPartner: string | null;
  deliveryAddress: string | null;
  deliveryNotes: string | null;
  contactNumber: string | null;
  occurredAt: string;
  settlementId: string | null;
  settledAt: string | null;
};

export type PartnerSettlementRecord = {
  id: string;
  partnerId: string;
  partnerCode: string;
  partnerName: string;
  totalTransactions: number;
  totalPoints: number;
  totalGrossAmount: number;
  commissionRate: number;
  commissionAmount: number;
  createdAt: string;
  transactionIds: string[];
};

function messageFromPayload(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
      return String((error as { message: unknown }).message);
    }
    if (typeof (payload as { message?: unknown }).message === "string") {
      return String((payload as { message: unknown }).message);
    }
  }
  return fallback;
}

async function rewardServiceJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${serviceBaseUrl("REWARD_SERVICE_URL", "http://127.0.0.1:4006")}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(response.status, messageFromPayload(payload, `Reward Service failed (${response.status}).`));
  }
  return payload as T;
}

export async function recordPartnerTransaction(input: {
  partnerId: string;
  partnerCode: string;
  partnerName: string;
  memberId: string;
  memberEmail?: string | null;
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
  const response = await rewardServiceJson<{ ok: true; transaction: PartnerTransactionRecord }>("/partners/transactions", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.transaction;
}

export async function buildPartnerDashboard() {
  const response = await rewardServiceJson<{
    ok: true;
    partners: Array<{
      partner: Record<string, unknown>;
      totals: {
        transactions: number;
        pendingTransactions: number;
        settledTransactions: number;
        points: number;
        grossAmount: number;
        totalCommission: number;
      };
    }>;
  }>("/partners/dashboard");
  return response.partners || [];
}

export async function createPartnerSettlement(input: {
  partnerId?: string;
  commissionRate?: number;
}) {
  const response = await rewardServiceJson<{ ok: true; settlement: PartnerSettlementRecord }>("/partners/settlements", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.settlement;
}

export async function loadPartnerSettlement(settlementId: string) {
  try {
    const response = await rewardServiceJson<{ ok: true; settlement: PartnerSettlementRecord }>(
      `/partners/settlements/${encodeURIComponent(settlementId)}`,
    );
    return response.settlement ?? null;
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 404) return null;
    throw error;
  }
}
