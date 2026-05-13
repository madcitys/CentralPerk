import { LocalRuntimeService, PointMemberRecord } from "../local-runtime/local-runtime.service";
import { TiersService } from "../tiers/tiers.service";
type AwardInput = {
    memberIdentifier?: string;
    fallbackEmail?: string;
    points?: number;
    transactionType?: string;
    transactionRef?: string;
    reason?: string;
    amountSpent?: number;
};
type RedeemInput = {
    memberIdentifier?: string;
    fallbackEmail?: string;
    points?: number;
    reason?: string;
    transactionType?: string;
    rewardCatalogId?: string;
};
export declare class PointsService {
    private readonly runtime;
    private readonly tiers;
    constructor(runtime: LocalRuntimeService, tiers: TiersService);
    private normalizeIdentifier;
    private matchMember;
    private findExistingMember;
    private createMember;
    private getMemberRecord;
    private awardAmount;
    award(input: AwardInput, idempotencyKey?: string): Promise<{
        memberId: string;
        pointsAwarded: number;
        newBalance: number;
        tier: string;
        transaction: {
            id: string;
            type: string;
            points: number;
            reason: string;
            date: string;
            expiry_date: null;
            reference: string;
        };
        source: string;
    }>;
    redeem(input: RedeemInput): Promise<{
        memberId: string;
        pointsRedeemed: number;
        newBalance: number;
        tier: string;
        transaction: {
            id: string;
            type: string;
            points: number;
            reason: string;
            date: string;
            expiry_date: null;
            reference: string | null;
        };
        source: string;
    }>;
    activity(memberIdentifier: string, fallbackEmail?: string): Promise<{
        balance: {
            member_id: string;
            points_balance: number;
            tier: string;
        };
        history: import("../local-runtime/local-runtime.service").PointHistoryRecord[];
        profile: {
            id: string;
            member_id: string;
            member_number: string;
            first_name: string;
            last_name: string;
            email: string;
            phone: string | null;
            birthdate: string | null;
            points_balance: number;
            tier: string;
            enrollment_date: string;
            profile_photo_url: string | null;
            status: "Active" | "Inactive";
        };
    }>;
    lookupByEmail(email?: string): Promise<{
        balance: {
            member_id: string;
            points_balance: number;
            tier: string;
        };
        history: import("../local-runtime/local-runtime.service").PointHistoryRecord[];
        profile: {
            id: string;
            member_id: string;
            member_number: string;
            first_name: string;
            last_name: string;
            email: string;
            phone: string | null;
            birthdate: string | null;
            points_balance: number;
            tier: string;
            enrollment_date: string;
            profile_photo_url: string | null;
            status: "Active" | "Inactive";
        };
    }>;
    snapshot(): Promise<PointMemberRecord[]>;
}
export {};
