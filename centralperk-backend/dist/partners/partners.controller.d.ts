import type { Request, Response } from "express";
import { PartnersService } from "./partners.service";
import { PartnerSettlementDto, PartnerTransactionDto } from "./dto";
export declare class PartnersController {
    private readonly partners;
    constructor(partners: PartnersService);
    transaction(body: PartnerTransactionDto, request: Request): Promise<{
        ok: boolean;
        transaction: {
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
        };
    }>;
    dashboard(): Promise<{
        ok: boolean;
        partners: {
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
        }[];
        source: string;
    }>;
    dashboardById(id: string): Promise<{
        ok: boolean;
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
            settlements: Record<string, unknown>[];
            recentTransactions: Record<string, unknown>[];
        };
        source: string;
    }>;
    settlement(body: PartnerSettlementDto, request: Request): Promise<{
        ok: boolean;
        settlement: {
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
        };
    }>;
    settlementByPartner(id: string, body: PartnerSettlementDto, request: Request): Promise<{
        ok: boolean;
        settlement: {
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
        };
    }>;
    pdf(id: string, response: Response): Promise<void>;
    pdfByPartnerMonth(id: string, month: string, response: Response): Promise<void>;
    paid(id: string): Promise<{
        ok: boolean;
        settlement: Record<string, unknown>;
    }>;
    status(id: string, body: {
        isActive?: boolean;
    }): Promise<{
        ok: boolean;
        partner: Record<string, unknown>;
    }>;
    paidByPartnerMonth(id: string, month: string): Promise<{
        ok: boolean;
        settlement: Record<string, unknown>;
    }>;
}
