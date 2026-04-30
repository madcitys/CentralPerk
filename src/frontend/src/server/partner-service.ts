import { loadRewardPartners } from "../app/lib/promotions";
import {
  type PartnerSettlementRecord,
  type PartnerTransactionRecord,
  readApiState,
  updateApiState,
} from "./local-store";
import { HttpError } from "./http-error";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function useLocalRuntimeFirst() {
  return (
    process.env.USE_REMOTE_LOYALTY_API !== "true" &&
    (process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true" || process.env.USE_LOCAL_LOYALTY_API === "true")
  );
}

export function normalizeSettlementMonth(month?: string | null) {
  const normalized = (month || currentMonthKey()).trim();
  if (!MONTH_PATTERN.test(normalized)) {
    throw new HttpError(400, "Settlement month must use YYYY-MM format.");
  }
  return normalized;
}

function monthKeyFromDate(value: string) {
  return String(value || new Date().toISOString()).slice(0, 7);
}

function normalizeSettlementRecord(settlement: PartnerSettlementRecord): PartnerSettlementRecord {
  return {
    ...settlement,
    month: settlement.month || monthKeyFromDate(settlement.createdAt),
    status: settlement.status || "generated",
    paidAt: settlement.paidAt ?? null,
  };
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
}) {
  return updateApiState((state) => {
    const duplicate = state.partnerTransactions.find(
      (item) =>
        item.partnerId === input.partnerId &&
        item.orderId.trim().toLowerCase() === input.orderId.trim().toLowerCase(),
    );

    if (duplicate) {
      throw new HttpError(409, "A partner transaction with this order ID already exists.");
    }

    const record: PartnerTransactionRecord = {
      id: crypto.randomUUID(),
      partnerId: input.partnerId,
      partnerCode: input.partnerCode.trim().toUpperCase(),
      partnerName: input.partnerName.trim(),
      memberId: input.memberId.trim(),
      memberEmail: input.memberEmail?.trim() || null,
      orderId: input.orderId.trim(),
      points: Math.max(0, Math.floor(input.points)),
      grossAmount: Math.max(0, Number(input.grossAmount || 0)),
      note: input.note?.trim() || "",
      occurredAt: new Date().toISOString(),
      settlementId: null,
      settledAt: null,
    };

    state.partnerTransactions.unshift(record);
    return record;
  });
}

export async function buildPartnerDashboard(partnerId?: string) {
  const [partners, apiState] = await Promise.all([
    useLocalRuntimeFirst() ? Promise.resolve([]) : loadRewardPartners().catch(() => []),
    readApiState(),
  ]);
  const partnerMap = new Map<string, any>();

  for (const partner of partners) {
    partnerMap.set(String(partner.id), partner);
  }

  for (const transaction of apiState.partnerTransactions) {
    if (!partnerMap.has(transaction.partnerId)) {
      partnerMap.set(transaction.partnerId, {
        id: transaction.partnerId,
        partnerCode: transaction.partnerCode,
        partnerName: transaction.partnerName,
        description: null,
        logoUrl: null,
        conversionRate: 1,
        isActive: true,
      });
    }
  }

  return Array.from(partnerMap.values())
    .filter((partner) => !partnerId || String(partner.id) === partnerId)
    .map((partner) => {
    const transactions = apiState.partnerTransactions.filter((item) => item.partnerId === partner.id);
    const pendingTransactions = transactions.filter((item) => !item.settlementId);
    const settlements = apiState.partnerSettlements
      .filter((item) => item.partnerId === partner.id)
      .map(normalizeSettlementRecord);
    const totalPoints = transactions.reduce((sum, item) => sum + item.points, 0);
    const totalGrossAmount = transactions.reduce((sum, item) => sum + item.grossAmount, 0);
    const totalCommission = settlements.reduce((sum, item) => sum + item.commissionAmount, 0);

    return {
      partner,
      totals: {
        transactions: transactions.length,
        pendingTransactions: pendingTransactions.length,
        settledTransactions: transactions.length - pendingTransactions.length,
        points: totalPoints,
        grossAmount: totalGrossAmount,
        totalCommission,
      },
      settlements,
      recentTransactions: transactions.slice(0, 10),
    };
  });
}

export async function createPartnerSettlement(input: {
  partnerId?: string;
  month?: string;
  commissionRate?: number;
}) {
  const commissionRate = Math.max(0, Number(input.commissionRate ?? 0.12));
  const settlementMonth = input.month ? normalizeSettlementMonth(input.month) : currentMonthKey();

  return updateApiState((state) => {
    const existing = input.partnerId
      ? state.partnerSettlements.find(
          (item) => item.partnerId === input.partnerId && normalizeSettlementRecord(item).month === settlementMonth,
        )
      : null;
    if (existing) return normalizeSettlementRecord(existing);

    const pendingTransactions = state.partnerTransactions.filter(
      (item) =>
        !item.settlementId &&
        (!input.partnerId || item.partnerId === input.partnerId) &&
        (!input.month || monthKeyFromDate(item.occurredAt) === settlementMonth),
    );

    if (pendingTransactions.length === 0) {
      throw new HttpError(404, "No pending partner transactions were found for settlement.");
    }

    const first = pendingTransactions[0];
    const totalGrossAmount = pendingTransactions.reduce((sum, item) => sum + item.grossAmount, 0);
    const totalPoints = pendingTransactions.reduce((sum, item) => sum + item.points, 0);
    const settlementId = crypto.randomUUID();
    const settlement: PartnerSettlementRecord = {
      id: settlementId,
      partnerId: first.partnerId,
      partnerCode: first.partnerCode,
      partnerName: first.partnerName,
      month: settlementMonth,
      totalTransactions: pendingTransactions.length,
      totalPoints,
      totalGrossAmount,
      commissionRate,
      commissionAmount: Number((totalGrossAmount * commissionRate).toFixed(2)),
      createdAt: new Date().toISOString(),
      status: "generated",
      paidAt: null,
      transactionIds: pendingTransactions.map((item) => item.id),
    };

    for (const transaction of state.partnerTransactions) {
      if (settlement.transactionIds.includes(transaction.id)) {
        transaction.settlementId = settlementId;
        transaction.settledAt = settlement.createdAt;
      }
    }

    state.partnerSettlements.unshift(settlement);
    return settlement;
  });
}

export async function loadPartnerSettlement(settlementId: string) {
  const state = await readApiState();
  const settlement = state.partnerSettlements.find((item) => item.id === settlementId);
  return settlement ? normalizeSettlementRecord(settlement) : null;
}

export async function loadPartnerSettlementByMonth(partnerId: string, month: string) {
  const normalizedMonth = normalizeSettlementMonth(month);
  const state = await readApiState();
  const settlement = state.partnerSettlements.find(
    (item) => item.partnerId === partnerId && normalizeSettlementRecord(item).month === normalizedMonth,
  );
  return settlement ? normalizeSettlementRecord(settlement) : null;
}

export async function markPartnerSettlementPaid(input: {
  partnerId: string;
  month: string;
  paidAt?: string;
}) {
  const normalizedMonth = normalizeSettlementMonth(input.month);
  return updateApiState((state) => {
    const settlement = state.partnerSettlements.find(
      (item) => item.partnerId === input.partnerId && normalizeSettlementRecord(item).month === normalizedMonth,
    );

    if (!settlement) throw new HttpError(404, "Settlement not found.");

    settlement.month = normalizedMonth;
    settlement.status = "paid";
    settlement.paidAt = input.paidAt || new Date().toISOString();
    return normalizeSettlementRecord(settlement);
  });
}
