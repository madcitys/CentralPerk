import { SupabaseService } from "../supabase/supabase.service";
export type TierRule = {
    tier_label: string;
    min_points: number;
    is_active: boolean;
};
export declare const DEFAULT_TIERS: TierRule[];
export declare class TiersService {
    private readonly supabase;
    private cache;
    constructor(supabase: SupabaseService);
    listTiers(): Promise<TierRule[]>;
    resolveTier(points: number): Promise<string>;
}
