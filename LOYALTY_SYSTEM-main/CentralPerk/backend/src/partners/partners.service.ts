import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { LocalRuntimeService } from "../local-runtime/local-runtime.service";
import { cleanString, nowIso, numberValue } from "../common/utils";

@Injectable()
export class PartnersService {
  constructor(private readonly runtime: LocalRuntimeService) {}

  private money(row: Record<string, unknown>) {
    return numberValue(row.amount, numberValue(row.grossAmount, numberValue(row.totalGrossAmount, numberValue(row.commissionAmount, 0))));
  }

  private monthKey(value?: unknown) {
    const text = cleanString(value);
    return text || new Date().toISOString().slice(0, 7);
  }

  async createTransaction(input: Record<string, unknown>) {
    const partnerId = cleanString(input.partnerId) || "PARTNER-001";
    const memberId = cleanString(input.memberId) || "MEM-000011";
    const amount = numberValue(input.amount, 0);
    if (amount <= 0) throw new BadRequestException("amount must be greater than zero.");

    return this.runtime.update((state) => {
      const transaction = {
        id: `ptxn-${Date.now()}`,
        partnerId,
        memberId,
        amount,
        points: Math.floor(amount),
        status: "posted",
        createdAt: nowIso(),
      };
      state.partnerTransactions.unshift(transaction);
      return transaction;
    });
  }

  async dashboard(partnerId?: string) {
    const state = await this.runtime.read();
    const selectedPartner = cleanString(partnerId);
    const transactions = state.partnerTransactions.filter((row) => !selectedPartner || row.partnerId === selectedPartner);
    const settlements = state.partnerSettlements.filter((row) => !selectedPartner || row.partnerId === selectedPartner);
    const totalTransactionAmount = transactions.reduce((sum, row) => sum + this.money(row), 0);
    const pendingSettlementAmount = settlements
      .filter((row) => row.status !== "paid")
      .reduce((sum, row) => sum + this.money(row), 0);
    const paidSettlementAmount = settlements
      .filter((row) => row.status === "paid")
      .reduce((sum, row) => sum + this.money(row), 0);

    return {
      partnerId: selectedPartner || "all",
      summary: {
        transactionCount: transactions.length,
        totalTransactionAmount,
        settlementCount: settlements.length,
        pendingSettlementAmount,
        paidSettlementAmount,
      },
      recentTransactions: transactions.slice(0, 10),
      recentSettlements: settlements.slice(0, 10),
      source: "local_runtime",
    };
  }

  async createSettlement(input: Record<string, unknown>) {
    const partnerId = cleanString(input.partnerId) || "PARTNER-001";
    const month = this.monthKey(input.month);

    return this.runtime.update((state) => {
      const transactionIds = state.partnerTransactions
        .filter((row) => row.partnerId === partnerId && String(row.createdAt || "").startsWith(month))
        .map((row) => row.id);
      const amount = state.partnerTransactions
        .filter((row) => transactionIds.includes(row.id))
        .reduce((sum, row) => sum + this.money(row), 0);
      const existing = state.partnerSettlements.find((row) => row.partnerId === partnerId && row.month === month);
      const settlement = {
        ...(existing || {}),
        id: existing?.id || `set-${partnerId}-${month}`.replace(/[^a-zA-Z0-9-]/g, "-"),
        partnerId,
        month,
        amount,
        transactionIds,
        status: existing?.status || "pending",
        createdAt: existing?.createdAt || nowIso(),
        updatedAt: nowIso(),
      };
      if (existing) Object.assign(existing, settlement);
      else state.partnerSettlements.unshift(settlement);
      return settlement;
    });
  }

  async markPaid(id: string) {
    return this.runtime.update((state) => {
      const settlement = state.partnerSettlements.find((row) => row.id === id);
      if (!settlement) throw new NotFoundException("Partner settlement not found.");
      settlement.status = "paid";
      settlement.paidAt = nowIso();
      settlement.updatedAt = nowIso();
      return settlement;
    });
  }

  async settlementPdf(id: string) {
    const state = await this.runtime.read();
    const settlement = state.partnerSettlements.find((row) => row.id === id);
    if (!settlement) throw new NotFoundException("Partner settlement not found.");
    const lines = [
      "System 3 Loyalty Partner Settlement",
      `Settlement ID: ${settlement.id}`,
      `Partner ID: ${settlement.partnerId}`,
      `Month: ${settlement.month}`,
      `Amount: ${numberValue(settlement.amount, 0).toFixed(2)}`,
      `Status: ${settlement.status}`,
    ];
    return this.tinyPdf(lines.join("\\n"));
  }

  private tinyPdf(text: string) {
    const safe = text.replace(/[()\\]/g, "\\$&").replace(/\r?\n/g, "\\n");
    const body = [
      "%PDF-1.4",
      "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
      "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
      "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
      `4 0 obj << /Length ${safe.length + 64} >> stream\nBT /F1 12 Tf 72 720 Td (${safe}) Tj ET\nendstream endobj`,
      "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
      "xref\n0 6\n0000000000 65535 f \n",
      "trailer << /Root 1 0 R /Size 6 >>",
      "startxref\n0\n%%EOF",
    ].join("\n");
    return Buffer.from(body, "utf8");
  }
}
