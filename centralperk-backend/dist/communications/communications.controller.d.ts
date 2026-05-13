import type { Request } from "express";
import { CommunicationsService } from "./communications.service";
import { SendEmailDto, SendSmsDto, UnsubscribeDto } from "./dto";
export declare class CommunicationsController {
    private readonly communications;
    constructor(communications: CommunicationsService);
    email(body: SendEmailDto, request: Request): Promise<{
        ok: boolean;
        result: {
            id: string;
            type: string;
            channel: string;
            status: string;
            campaignId: string | null;
            memberId: string | null;
            email: string | null;
            subject: string;
            message: string;
            read: boolean;
            createdAt: string;
        };
    }>;
    sms(body: SendSmsDto, request: Request): Promise<{
        ok: boolean;
        result: {
            id: string;
            type: string;
            channel: string;
            status: string;
            memberId: string | null;
            phone: string | null;
            message: string;
            read: boolean;
            createdAt: string;
        };
    }>;
    notifications(memberId?: string, email?: string, limit?: string): Promise<{
        ok: boolean;
        notifications: Record<string, unknown>[] | {
            id: string;
            type: string;
            channel: string;
            subject: string;
            message: string;
            status: string;
            read: boolean;
            createdAt: string;
        }[];
    }>;
    read(id: string): Promise<{
        ok: boolean;
        notification: Record<string, unknown>;
    }>;
    analytics(): Promise<{
        ok: boolean;
        analytics: Record<string, unknown> | {
            total: number;
            byChannel: {
                email: number;
                sms: number;
            };
            byStatus: {
                sent: number;
                queued: number;
                failed: number;
                read: number;
            };
            recent: Record<string, unknown>[];
            totalMessages: number;
            emailMessages: number;
            smsMessages: number;
            sent: number;
            queued: number;
            failed: number;
            openRate: number;
            clickRate: number;
            optOutCount: number;
            recentMessages: Record<string, unknown>[];
            source: string;
        };
    }>;
    unsubscribe(body: UnsubscribeDto, request: Request): Promise<{
        ok: boolean;
        preferences: {
            email: boolean;
            sms: boolean;
            promotionalOptIn: boolean;
            unsubscribedAt: string;
        };
    }>;
}
