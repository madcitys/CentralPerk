import { SegmentsService } from "./segments.service";
export declare class SegmentsController {
    private readonly segments;
    constructor(segments: SegmentsService);
    list(): Promise<{
        ok: boolean;
        segments: {
            id: string;
            name: string;
            description: string | null;
            is_system: boolean;
            created_at: string;
            updated_at: string;
            logicMode: string;
            conditions: {
                id?: string;
                field: string;
                operator: string;
                value: string;
            }[];
            memberIds: string[];
        }[];
        source: string;
    }>;
    create(body: Record<string, unknown>, query: Record<string, unknown>): Promise<{
        ok: boolean;
        segment: {
            id: string;
            name: string;
            description: string | null;
            is_system: boolean;
            created_at: string;
            updated_at: string;
            logicMode: string;
            conditions: {
                id?: string;
                field: string;
                operator: string;
                value: string;
            }[];
            memberIds: string[];
        };
        segmentId: string;
    }>;
    preview(body: Record<string, unknown>, query: Record<string, unknown>): Promise<{
        ok: boolean;
        preview: {
            count: number;
            memberIds: string[];
            sampleMembers: import("../local-runtime/local-runtime.service").PointMemberRecord[];
            logicMode: string;
            conditions: {
                id?: string;
                field: string;
                operator: string;
                value: string;
            }[];
        };
    }>;
    previewQuery(query: Record<string, unknown>): Promise<{
        ok: boolean;
        preview: {
            count: number;
            memberIds: string[];
            sampleMembers: import("../local-runtime/local-runtime.service").PointMemberRecord[];
            logicMode: string;
            conditions: {
                id?: string;
                field: string;
                operator: string;
                value: string;
            }[];
        };
    }>;
    update(id: string, body: Record<string, unknown>): Promise<{
        ok: boolean;
        segment: {
            id: string;
            name: string;
            description: string | null;
            is_system: boolean;
            created_at: string;
            updated_at: string;
            logicMode: string;
            conditions: {
                id?: string;
                field: string;
                operator: string;
                value: string;
            }[];
            memberIds: string[];
        };
    }>;
    remove(id: string): Promise<{
        deleted: boolean;
        ok: boolean;
    }>;
}
