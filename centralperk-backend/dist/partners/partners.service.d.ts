import { LocalRuntimeService } from "../local-runtime/local-runtime.service";
type PartnerDescriptor = {
    id: string;
    partnerCode: string;
    partnerName: string;
    description: string | null;
    logoUrl: string | null;
    conversionRate: number;
    isActive: boolean;
};
export declare class PartnersService {
    private readonly runtime;
    constructor(runtime: LocalRuntimeService);
    private partnerCatalog;
    private money;
    private monthKey;
    private commissionForAmount;
    private resolvePartner;
    createTransaction(input: Record<string, unknown>): Promise<{
        id: string;
        partnerId: string;
        partnerCode: string;
        partnerName: string;
        memberId: string;
        amount: number;
        grossAmount: number;
        points: number;
        status: string;
        note: string | null;
        createdAt: string;
    }>;
    dashboard(): Promise<{
        partner: PartnerDescriptor;
        totals: {
            transactions: number;
            pendingTransactions: number;
            settledTransactions: number;
            points: number;
            grossAmount: number;
            totalCommission: number;
        };
    }[]>;
    dashboardById(partnerId: string): Promise<{
        partner: PartnerDescriptor;
        totals: {
            transactions: number;
            pendingTransactions: number;
            settledTransactions: number;
            points: number;
            grossAmount: number;
            totalCommission: number;
        };
        settlements: Record<string, unknown>[];
        recentTransactions: Record<string, unknown>[];
    }>;
    createSettlement(input: Record<string, unknown>): Promise<{
        id: {};
        partnerId: string;
        partnerCode: string;
        partnerName: string;
        month: string;
        amount: number;
        grossAmount: number;
        commissionAmount: number;
        transactionIds: unknown[];
        status: {};
        createdAt: {};
        updatedAt: string;
    }>;
    markPaid(id: string): Promise<Record<string, unknown>>;
    setStatus(partnerId: string, isActive: boolean): Promise<Record<string, unknown>>;
    findSettlementByPartnerMonth(partnerId: string, month: string): Promise<Record<string, unknown>>;
    settlementPdf(id: string): Promise<Buffer<ArrayBuffer>>;
    private tinyPdf;
}
export {};
