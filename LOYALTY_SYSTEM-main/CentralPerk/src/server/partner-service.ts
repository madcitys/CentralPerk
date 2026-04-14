import { loadRewardPartners } from "../app/lib/promotions";
import {
  type PartnerSettlementRecord,
  type PartnerTransactionRecord,
  readApiState,
  updateApiState,
} from "./local-store";
import { HttpError } from "./http-error";

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

export async function buildPartnerDashboard() {
  const [partners, apiState] = await Promise.all([loadRewardPartners().catch(() => []), readApiState()]);

  return partners.map((partner) => {
    const transactions = apiState.partnerTransactions.filter((item) => item.partnerId === partner.id);
    const pendingTransactions = transactions.filter((item) => !item.settlementId);
    const settlements = apiState.partnerSettlements.filter((item) => item.partnerId === partner.id);
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
    };
  });
}

export async function createPartnerSettlement(input: {
  partnerId?: string;
  commissionRate?: number;
}) {
  const commissionRate = Math.max(0, Number(input.commissionRate ?? 0.12));

  return updateApiState((state) => {
    const pendingTransactions = state.partnerTransactions.filter(
      (item) => !item.settlementId && (!input.partnerId || item.partnerId === input.partnerId),
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
      totalTransactions: pendingTransactions.length,
      totalPoints,
      totalGrossAmount,
      commissionRate,
      commissionAmount: Number((totalGrossAmount * commissionRate).toFixed(2)),
      createdAt: new Date().toISOString(),
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
  return state.partnerSettlements.find((item) => item.id === settlementId) ?? null;
}
