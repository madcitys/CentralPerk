import { RewardsService } from "./rewards.service";
import { PointsService } from "../points/points.service";
export declare class RewardsController {
    private readonly rewards;
    private readonly points;
    constructor(rewards: RewardsService, points: PointsService);
    list(): Promise<{
        ok: boolean;
        rewards: {
            id: string;
            rewardCatalogId: string;
            name: string;
            description: string | null;
            pointsCost: number;
            category: string | null;
            imageUrl: string | null;
            available: boolean;
            active: boolean;
            expiryDate: string | null;
            partnerId: string | null;
            cashValue: number | null;
            activeFlashSaleId?: string | null;
            flashSaleStartsAt?: string | null;
            flashSaleEndsAt?: string | null;
            flashSaleQuantityLimit?: number | null;
            flashSaleClaimedCount?: number;
            flashSaleBanner?: string | null;
            flashSaleCountdownLabel?: string | null;
        }[];
        source: string;
    }>;
    active(tier?: string): Promise<{
        ok: boolean;
        rewards: {
            id: string;
            rewardCatalogId: string;
            name: string;
            description: string | null;
            pointsCost: number;
            category: string | null;
            imageUrl: string | null;
            available: boolean;
            active: boolean;
            expiryDate: string | null;
            partnerId: string | null;
            cashValue: number | null;
            activeFlashSaleId?: string | null;
            flashSaleStartsAt?: string | null;
            flashSaleEndsAt?: string | null;
            flashSaleQuantityLimit?: number | null;
            flashSaleClaimedCount?: number;
            flashSaleBanner?: string | null;
            flashSaleCountdownLabel?: string | null;
        }[];
        source: string;
    }>;
    get(id: string): Promise<{
        ok: boolean;
        reward: {
            id: string;
            rewardCatalogId: string;
            name: string;
            description: string | null;
            pointsCost: number;
            category: string | null;
            imageUrl: string | null;
            available: boolean;
            active: boolean;
            expiryDate: string | null;
            partnerId: string | null;
            cashValue: number | null;
            activeFlashSaleId?: string | null;
            flashSaleStartsAt?: string | null;
            flashSaleEndsAt?: string | null;
            flashSaleQuantityLimit?: number | null;
            flashSaleClaimedCount?: number;
            flashSaleBanner?: string | null;
            flashSaleCountdownLabel?: string | null;
        };
    }>;
    redeem(body: Record<string, unknown>): Promise<{
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
}
