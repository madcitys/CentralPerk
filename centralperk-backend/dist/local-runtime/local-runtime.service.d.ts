import { ApiConfigService } from "../config/api-config.service";
export type PointHistoryRecord = {
    id: string;
    type: string;
    points: number;
    reason: string;
    date: string;
    expiry_date: string | null;
    reference: string | null;
};
export type PointMemberRecord = {
    memberId: string;
    memberNumber?: string;
    email: string | null;
    firstName?: string;
    lastName?: string;
    phone?: string | null;
    birthdate?: string | null;
    enrollmentDate?: string | null;
    profileImage?: string | null;
    status?: "Active" | "Inactive";
    pointsBalance: number;
    tier: string;
    history: PointHistoryRecord[];
};
export type LocalState = {
    idempotency: Record<string, unknown>;
    partners: Record<string, Record<string, unknown>>;
    rewards: Record<string, Record<string, unknown>>;
    partnerTransactions: Array<Record<string, unknown>>;
    partnerSettlements: Array<Record<string, unknown>>;
    pointMembers: Record<string, PointMemberRecord>;
    campaigns: Record<string, Record<string, unknown>>;
    segments: Record<string, Record<string, unknown>>;
    notifications: Array<Record<string, unknown>>;
    communicationPreferences: Record<string, Record<string, unknown>>;
} & Record<string, unknown>;
export declare class LocalRuntimeService {
    private readonly config;
    private cache;
    private seedCache;
    private writeChain;
    constructor(config: ApiConfigService);
    private get storePath();
    private get seedModulePath();
    private ensureDir;
    private loadSeedState;
    read(): Promise<LocalState>;
    snapshotPoints(): Promise<PointMemberRecord[]>;
    writeSeedFile(): Promise<LocalState>;
    update<T>(updater: (state: LocalState) => T | Promise<T>): Promise<T>;
}
