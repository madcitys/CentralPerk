import { AdminMobileService } from "./admin-mobile.service";
export declare class AdminMobileController {
    private readonly adminMobile;
    constructor(adminMobile: AdminMobileService);
    pointsSnapshot(): Promise<{
        ok: boolean;
        snapshot: {
            members: import("../local-runtime/local-runtime.service").PointMemberRecord[];
        };
        source: string;
    }>;
    mobileSummary(from?: string, to?: string): Promise<{
        ok: boolean;
        source: string;
        summary: {
            programHealth: {
                totalMembers: number;
                activeRate: number;
                score: number;
                earnedPoints: number;
                redeemedPoints: number;
            };
            clv: {
                total: number;
                average: number;
                projectedAverage: number;
                trend: {
                    label: string;
                    value: number;
                }[];
            };
            churnRisk: {
                segments: {
                    label: string;
                    value: number;
                }[];
                highRiskMembers: number;
                mediumRiskMembers: number;
                lowRiskMembers: number;
            };
            pointsLiability: {
                points: number;
                monetary: number;
                trend: {
                    label: string;
                    points: number;
                }[];
            };
        };
    }>;
    engagementSummary(): Promise<{
        ok: boolean;
        source: string;
        notificationCampaigns: Record<string, unknown>[];
        notificationTemplates: {
            id: string;
            name: string;
            trigger: string;
            message: string;
        }[];
        challenges: Record<string, unknown>[] | {
            id: string;
            name: string;
            description: string;
            participants: number;
            completions: number;
            reward: string;
            status: string;
            createdAt: string;
        }[];
        challengeLeaderboard: Record<string, unknown>[] | {
            id: string;
            rank: number;
            memberId: string;
            memberName: string;
            points: number;
            tier: string;
        }[];
        shareEvents: Record<string, unknown>[] | {
            id: string;
            memberId: string;
            memberName: string;
            channel: string;
            achievement: string;
            conversions: number;
            tier: string;
            createdAt: string;
        }[];
        surveys: Record<string, unknown>[];
        winBackCampaigns: Record<string, unknown>[];
        referrals: Record<string, unknown>[] | {
            id: string;
            memberId: string;
            memberName: string;
            referralCode: string;
            referralsCount: number;
            conversions: number;
            createdAt: string;
        }[];
        feedback: Record<string, unknown>[] | {
            id: string;
            memberId: string;
            memberName: string;
            rating: number;
            summary: string;
            createdAt: string;
        }[];
    }>;
    notificationCampaigns(): Promise<{
        ok: boolean;
        notificationCampaigns: Record<string, unknown>[];
    }>;
    createNotificationCampaign(body: Record<string, unknown>): Promise<{
        ok: boolean;
        campaign: {
            id: string;
            name: string;
            segment: string;
            trigger: string;
            scheduledFor: string;
            sentCount: number;
            deliveredCount: number;
            openedCount: number;
            audienceSize: number;
            status: string;
            variantA: string;
            variantB: string;
            createdAt: string;
        };
    }>;
    launchNotificationCampaign(id: string): Promise<{
        ok: boolean;
        campaign: Record<string, unknown>;
    }>;
    surveys(): Promise<{
        ok: boolean;
        surveys: Record<string, unknown>[];
    }>;
    createSurvey(body: Record<string, unknown>): Promise<{
        ok: boolean;
        survey: {
            id: string;
            title: string;
            description: string;
            segment: string;
            bonusPoints: number;
            status: string;
            questions: any[];
            responses: never[];
            createdAt: string;
        };
    }>;
    winBackCampaigns(): Promise<{
        ok: boolean;
        winBackCampaigns: Record<string, unknown>[];
    }>;
    createWinBackCampaign(body: Record<string, unknown>): Promise<{
        ok: boolean;
        campaign: {
            id: string;
            name: string;
            offerType: string;
            offerValue: string;
            targetedMembers: number;
            responses: number;
            reengagedMembers: number;
            estimatedRevenue: number;
            offerCost: number;
            status: string;
            launchDate: string;
        };
    }>;
    settings(): Promise<{
        tiers: any[];
        earningRules: any[];
        birthdaySettings: {
            amounts: {
                Bronze: number;
                Silver: number;
                Gold: number;
            };
            releaseTiming: string;
            fulfillmentMode: string;
            claimWindow: string;
        };
        source: string;
    }>;
    updateSettings(body: Record<string, unknown>): Promise<{
        source: string;
        tiers: any[];
        earningRules: any[];
        birthdaySettings: {
            amounts: {
                Bronze: number;
                Silver: number;
                Gold: number;
            };
            releaseTiming: string;
            fulfillmentMode: string;
            claimWindow: string;
        };
        updatedAt: string;
    }>;
}
