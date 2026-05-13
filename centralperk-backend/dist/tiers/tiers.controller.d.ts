import { TiersService } from "./tiers.service";
export declare class TiersController {
    private readonly tiers;
    constructor(tiers: TiersService);
    list(): Promise<{
        ok: boolean;
        tiers: import("./tiers.service").TierRule[];
    }>;
}
