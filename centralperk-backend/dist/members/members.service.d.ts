import { PointsService } from "../points/points.service";
import { LocalRuntimeService } from "../local-runtime/local-runtime.service";
import { SupabaseService } from "../supabase/supabase.service";
export declare class MembersService {
    private readonly points;
    private readonly runtime;
    private readonly supabase;
    constructor(points: PointsService, runtime: LocalRuntimeService, supabase: SupabaseService);
    private localMembers;
    private supabaseMembers;
    list(limit?: number, email?: string): Promise<{
        lifetimePoints: number;
        id: string | number;
        memberId: string;
        member_id: string;
        memberNumber: string;
        member_number: string;
        first_name: string;
        last_name: string;
        email: string | null;
        phone: string | null;
        enrollment_date: string;
        pointsBalance: number;
        points_balance: number;
        tier: string;
    }[]>;
    get(memberId: string, email?: string): Promise<{
        lifetimePoints: number;
        id: string | number;
        memberId: string;
        member_id: string;
        memberNumber: string;
        member_number: string;
        first_name: string;
        last_name: string;
        email: string | null;
        phone: string | null;
        enrollment_date: string;
        pointsBalance: number;
        points_balance: number;
        tier: string;
    } | null>;
    profile(memberId: string, email?: string): Promise<{
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
    }>;
    tier(memberId: string, email?: string): Promise<string>;
    notifications(memberId: string, limit?: number): Promise<Record<string, unknown>[]>;
    preferences(memberId: string, patch: Record<string, unknown>): Promise<{
        [x: string]: unknown;
    }>;
}
