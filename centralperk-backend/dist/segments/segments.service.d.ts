import { LocalRuntimeService } from "../local-runtime/local-runtime.service";
import { PointsService } from "../points/points.service";
type SegmentCondition = {
    id?: string;
    field: string;
    operator: string;
    value: string;
};
export declare class SegmentsService {
    private readonly runtime;
    private readonly points;
    constructor(runtime: LocalRuntimeService, points: PointsService);
    private slug;
    private normalizeCondition;
    private normalize;
    private matches;
    preview(input: Record<string, unknown>): Promise<{
        count: number;
        memberIds: string[];
        sampleMembers: import("../local-runtime/local-runtime.service").PointMemberRecord[];
        logicMode: string;
        conditions: SegmentCondition[];
    }>;
    create(input: Record<string, unknown>): Promise<{
        id: string;
        name: string;
        description: string | null;
        is_system: boolean;
        created_at: string;
        updated_at: string;
        logicMode: string;
        conditions: SegmentCondition[];
        memberIds: string[];
    }>;
    list(): Promise<{
        id: string;
        name: string;
        description: string | null;
        is_system: boolean;
        created_at: string;
        updated_at: string;
        logicMode: string;
        conditions: SegmentCondition[];
        memberIds: string[];
    }[]>;
    update(id: string, patch: Record<string, unknown>): Promise<{
        id: string;
        name: string;
        description: string | null;
        is_system: boolean;
        created_at: string;
        updated_at: string;
        logicMode: string;
        conditions: SegmentCondition[];
        memberIds: string[];
    }>;
    remove(id: string): Promise<{
        deleted: boolean;
    }>;
}
export {};
