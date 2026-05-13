import { LocalRuntimeService } from "./local-runtime.service";
export declare class LocalRuntimeController {
    private readonly runtime;
    constructor(runtime: LocalRuntimeService);
    points(): Promise<{
        ok: boolean;
        source: string;
        snapshot: {
            members: import("./local-runtime.service").PointMemberRecord[];
        };
    }>;
    seed(): Promise<{
        ok: boolean;
        source: string;
        seeded: boolean;
        counts: {
            members: number;
            rewards: number;
            campaigns: number;
            segments: number;
            partners: number;
            notifications: number;
            pointsLedgerRows: number;
            partnerTransactions: number;
        };
    }>;
}
