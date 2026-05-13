import { LocalRuntimeService } from "../local-runtime/local-runtime.service";
export declare class CommunicationsService {
    private readonly runtime;
    private analyticsCache;
    private notificationsCache;
    constructor(runtime: LocalRuntimeService);
    private isFresh;
    private clearReadCaches;
    sendEmail(input: Record<string, unknown>): Promise<{
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
    }>;
    sendSms(input: Record<string, unknown>): Promise<{
        id: string;
        type: string;
        channel: string;
        status: string;
        memberId: string | null;
        phone: string | null;
        message: string;
        read: boolean;
        createdAt: string;
    }>;
    analytics(): Promise<Record<string, unknown> | {
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
    }>;
    notifications(input: {
        memberId?: string;
        email?: string;
        limit?: number;
    }): Promise<Record<string, unknown>[] | {
        id: string;
        type: string;
        channel: string;
        subject: string;
        message: string;
        status: string;
        read: boolean;
        createdAt: string;
    }[]>;
    markRead(id: string): Promise<Record<string, unknown>>;
    unsubscribe(input: Record<string, unknown>): Promise<{
        email: boolean;
        sms: boolean;
        promotionalOptIn: boolean;
        unsubscribedAt: string;
    }>;
}
