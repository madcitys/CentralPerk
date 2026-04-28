import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { LocalRuntimeService } from "../local-runtime/local-runtime.service";
import { cleanString, nowIso, numberValue } from "../common/utils";

type PartnerDescriptor = {
  id: string;
  partnerCode: string;
  partnerName: string;
  description: string | null;
  logoUrl: string | null;
  conversionRate: number;
  isActive: boolean;
};

@Injectable()
export class PartnersService {
  constructor(private readonly runtime: LocalRuntimeService) {}

  private async partnerCatalog() {
    const state = await this.runtime.read();
    return state.partners || {};
  }

  private money(row: Record<string, unknown>) {
    return numberValue(
      row.amount,
      numberValue(row.grossAmount, numberValue(row.totalGrossAmount, numberValue(row.commissionAmount, 0))),
    );
  }

  private monthKey(value?: unknown) {
    const text = cleanString(value);
    return text || new Date().toISOString().slice(0, 7);
  }

  private commissionForAmount(amount: number) {
    return Number((amount * 0.12).toFixed(2));
  }

  private async resolvePartner(row: Record<string, unknown>): Promise<PartnerDescriptor> {
    const partnerId = cleanString(row.partnerId) || "PARTNER-001";
    const catalog = await this.partnerCatalog();
    const existing = catalog[partnerId] as Partial<PartnerDescriptor> | undefined;
    return {
      id: existing?.id || partnerId,
      partnerCode: cleanString(row.partnerCode) || cleanString(existing?.partnerCode) || partnerId,
      partnerName: cleanString(row.partnerName) || cleanString(existing?.partnerName) || partnerId,
      description: existing?.description || null,
      logoUrl: existing?.logoUrl || null,
      conversionRate: numberValue(existing?.conversionRate, 10),
      isActive: existing?.isActive !== false,
    };
  }

  async createTransaction(input: Record<string, unknown>) {
    const partnerId = cleanString(input.partnerId) || "PARTNER-001";
    const memberId = cleanString(input.memberId) || "MEM-000008";
    const amount = numberValue(input.grossAmount, numberValue(input.amount, 0));
    if (amount <= 0) throw new BadRequestException("grossAmount must be greater than zero.");

    return this.runtime.update((state) => {
      return this.resolvePartner({
        partnerId,
        partnerCode: input.partnerCode,
        partnerName: input.partnerName,
      }).then((partner) => {
        const transaction = {
          id: cleanString(input.orderId) || `ptxn-${Date.now()}`,
          partnerId,
          partnerCode: partner.partnerCode,
          partnerName: partner.partnerName,
          memberId,
          amount,
          grossAmount: amount,
          points: Math.max(1, Math.floor(numberValue(input.points, amount / partner.conversionRate))),
          status: "pending",
          note: cleanString(input.note) || null,
          createdAt: nowIso(),
        };
        state.partnerTransactions.unshift(transaction);
        return transaction;
      });
    });
  }

  async dashboard() {
    const state = await this.runtime.read();
    const catalog = await this.partnerCatalog();
    const groups = new Map<string, { partner: PartnerDescriptor; transactions: Array<Record<string, unknown>>; settlements: Array<Record<string, unknown>> }>();

    for (const row of state.partnerTransactions) {
      const partner = await this.resolvePartner(row);
      const entry = groups.get(partner.id) || { partner, transactions: [], settlements: [] };
      entry.transactions.push(row);
      groups.set(partner.id, entry);
    }

    for (const row of state.partnerSettlements) {
      const partner = await this.resolvePartner(row);
      const entry = groups.get(partner.id) || { partner, transactions: [], settlements: [] };
      entry.settlements.push(row);
      groups.set(partner.id, entry);
    }

    for (const partner of Object.values(catalog) as PartnerDescriptor[]) {
      if (!groups.has(partner.id)) {
        groups.set(partner.id, { partner, transactions: [], settlements: [] });
      }
    }

    return Array.from(groups.values())
      .map(({ partner, transactions, settlements }) => {
        const pendingTransactions = transactions.filter((row) => cleanString(row.status) !== "settled").length;
        const settledTransactions = transactions.length - pendingTransactions;
        const points = transactions.reduce((sum, row) => sum + numberValue(row.points, 0), 0);
        const grossAmount = transactions.reduce((sum, row) => sum + this.money(row), 0);
        const totalCommission = settlements.length
          ? settlements.reduce((sum, row) => sum + numberValue(row.commissionAmount, this.commissionForAmount(this.money(row))), 0)
          : this.commissionForAmount(grossAmount);
        return {
          partner,
          totals: {
            transactions: transactions.length,
            pendingTransactions,
            settledTransactions,
            points,
            grossAmount,
            totalCommission,
          },
        };
      })
      .sort((left, right) => left.partner.partnerName.localeCompare(right.partner.partnerName));
  }

  async dashboardById(partnerId: string) {
    const state = await this.runtime.read();
    const partners = await this.dashboard();
    const row = partners.find((entry) => entry.partner.id === partnerId);
    if (!row) throw new NotFoundException("Partner not found.");
    return {
      partner: row.partner,
      totals: row.totals,
      settlements: state.partnerSettlements.filter((entry) => cleanString(entry.partnerId) === partnerId),
      recentTransactions: state.partnerTransactions.filter((entry) => cleanString(entry.partnerId) === partnerId).slice(0, 20),
    };
  }

  async createSettlement(input: Record<string, unknown>) {
    const partnerId = cleanString(input.partnerId) || "PARTNER-001";
    const month = this.monthKey(input.month);

    return this.runtime.update((state) => {
      return this.resolvePartner({ partnerId }).then((partner) => {
        const transactionIds = state.partnerTransactions
          .filter((row) => row.partnerId === partnerId && String(row.createdAt || "").startsWith(month))
          .map((row) => row.id);
        const amount = state.partnerTransactions
          .filter((row) => transactionIds.includes(String(row.id)))
          .reduce((sum, row) => sum + this.money(row), 0);
        const existing = state.partnerSettlements.find((row) => row.partnerId === partnerId && row.month === month);
        const settlement = {
          ...(existing || {}),
          id: existing?.id || `set-${partnerId}-${month}`.replace(/[^a-zA-Z0-9-]/g, "-"),
          partnerId,
          partnerCode: partner.partnerCode,
          partnerName: partner.partnerName,
          month,
          amount,
          grossAmount: amount,
          commissionAmount: this.commissionForAmount(amount),
          transactionIds,
          status: existing?.status || "pending",
          createdAt: existing?.createdAt || nowIso(),
          updatedAt: nowIso(),
        };
        if (existing) Object.assign(existing, settlement);
        else state.partnerSettlements.unshift(settlement);
        for (const row of state.partnerTransactions) {
          if (transactionIds.includes(String(row.id))) row.status = "settled";
        }
        return settlement;
      });
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

  async findSettlementByPartnerMonth(partnerId: string, month: string) {
    const state = await this.runtime.read();
    const settlement = state.partnerSettlements.find(
      (row) => cleanString(row.partnerId) === partnerId && cleanString(row.month) === month,
    );
    if (!settlement) throw new NotFoundException("Partner settlement not found.");
    return settlement;
  }

  async settlementPdf(id: string) {
    const state = await this.runtime.read();
    const settlement = state.partnerSettlements.find((row) => row.id === id);
    if (!settlement) throw new NotFoundException("Partner settlement not found.");
    const lines = [
      "System 3 Loyalty Partner Settlement",
      `Settlement ID: ${settlement.id}`,
      `Partner ID: ${settlement.partnerId}`,
      `Partner Name: ${settlement.partnerName}`,
      `Month: ${settlement.month}`,
      `Gross Amount: ${numberValue(settlement.grossAmount, this.money(settlement)).toFixed(2)}`,
      `Commission: ${numberValue(settlement.commissionAmount, 0).toFixed(2)}`,
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
