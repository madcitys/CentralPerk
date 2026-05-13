import { MembersService } from "./members.service";
export declare class MembersController {
    private readonly members;
    constructor(members: MembersService);
    list(limit?: string, email?: string): Promise<{
        ok: boolean;
        members: {
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
        }[];
    }>;
    get(id: string, email?: string): Promise<{
        ok: boolean;
        member: {
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
        } | null;
    }>;
    profile(id: string, email?: string): Promise<{
        ok: boolean;
        memberId: string;
        profile: {
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
        };
    }>;
    tier(id: string, email?: string): Promise<{
        ok: boolean;
        memberId: string;
        tier: string;
    }>;
    notifications(id: string, limit?: string): Promise<{
        ok: boolean;
        memberId: string;
        notifications: Record<string, unknown>[];
    }>;
    preferences(id: string, body: Record<string, unknown>): Promise<{
        ok: boolean;
        memberId: string;
        preference: {
            [x: string]: unknown;
        };
    }>;
}
