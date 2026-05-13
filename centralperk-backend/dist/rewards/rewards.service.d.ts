import { LocalRuntimeService } from "../local-runtime/local-runtime.service";
import { SupabaseService } from "../supabase/supabase.service";
type RewardRecord = {
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
export declare class RewardsService {
    private readonly runtime;
    private readonly supabase;
    constructor(runtime: LocalRuntimeService, supabase: SupabaseService);
    private localRewards;
    private supabaseRewards;
    list(): Promise<RewardRecord[]>;
    active(tier?: string): Promise<RewardRecord[]>;
    get(id: string): Promise<RewardRecord>;
}
export {};
