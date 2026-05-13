import type { Request } from "express";
import { PointsService } from "./points.service";
import { AwardPointsDto, RedeemPointsDto } from "./dto";
export declare class PointsController {
    private readonly points;
    constructor(points: PointsService);
    award(body: AwardPointsDto, request: Request, idempotencyKey?: string): Promise<{
        ok: boolean;
        result: {
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
        };
    }>;
    redeem(body: RedeemPointsDto, request: Request): Promise<{
        ok: boolean;
        result: {
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
        };
    }>;
    pointsForMember(id: string, email?: string): Promise<{
        ok: boolean;
        memberId: string;
        points: number;
        balance: {
            member_id: string;
            points_balance: number;
            tier: string;
        };
    }>;
    history(id: string, email?: string): Promise<{
        ok: boolean;
        memberId: string;
        history: import("../local-runtime/local-runtime.service").PointHistoryRecord[];
    }>;
    pointsLookup(memberId?: string, email?: string): Promise<{
        ok: boolean;
        memberId: string;
        points: number;
        balance: {
            member_id: string;
            points_balance: number;
            tier: string;
        };
    }>;
    pointsHistoryLookup(memberId?: string, email?: string): Promise<{
        ok: boolean;
        memberId: string;
        history: import("../local-runtime/local-runtime.service").PointHistoryRecord[];
    }>;
}
