"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MembersService = void 0;
const common_1 = require("@nestjs/common");
const points_service_1 = require("../points/points.service");
const local_runtime_service_1 = require("../local-runtime/local-runtime.service");
const supabase_service_1 = require("../supabase/supabase.service");
function normalizeMember(row) {
    const databaseId = row.id ?? row.member_id ?? row.memberId ?? row.member_number ?? row.memberNumber ?? "";
    const memberId = String(row.member_id || row.memberId || row.member_number || row.memberNumber || row.id || "");
    const memberNumber = String(row.member_number || row.memberNumber || memberId || row.id || "");
    const pointsBalance = Number(row.points_balance ?? row.pointsBalance ?? 0);
    return {
        id: databaseId,
        memberId,
        member_id: memberId,
        memberNumber,
        member_number: memberNumber,
        first_name: String(row.first_name || row.firstName || "Demo"),
        last_name: String(row.last_name || row.lastName || "Member"),
        email: row.email ? String(row.email) : null,
        phone: row.phone ? String(row.phone) : null,
        enrollment_date: String(row.enrollment_date || row.enrollmentDate || new Date().toISOString()),
        pointsBalance,
        points_balance: pointsBalance,
        tier: String(row.tier || "Bronze"),
    };
}
let MembersService = class MembersService {
    points;
    runtime;
    supabase;
    constructor(points, runtime, supabase) {
        this.points = points;
        this.runtime = runtime;
        this.supabase = supabase;
    }
    async localMembers() {
        const state = await this.runtime.read();
        return Object.values(state.pointMembers || {}).map((member) => normalizeMember({
            id: member.memberId,
            member_id: member.memberId,
            member_number: member.memberNumber || member.memberId,
            first_name: member.firstName || "Demo",
            last_name: member.lastName || "Member",
            email: member.email,
            phone: member.phone || null,
            enrollment_date: member.enrollmentDate || new Date().toISOString(),
            points_balance: member.pointsBalance,
            tier: member.tier,
        }));
    }
    async supabaseMembers(email) {
        const admin = this.supabase.admin;
        if (!admin)
            return [];
        let query = admin
            .from("loyalty_members")
            .select("id,member_id,member_number,first_name,last_name,email,phone,enrollment_date,points_balance,tier")
            .order("enrollment_date", { ascending: false });
        if (email) {
            query = query.eq("email", email);
        }
        const { data, error } = await query.limit(500);
        if (error)
            return [];
        return (data || []).map((row) => normalizeMember(row));
    }
    async list(limit = 100, email) {
        const normalizedEmail = String(email || "").trim().toLowerCase();
        const merged = new Map();
        for (const member of await this.localMembers()) {
            if (normalizedEmail && String(member.email || "").trim().toLowerCase() !== normalizedEmail)
                continue;
            merged.set(member.member_number, member);
        }
        for (const member of await this.supabaseMembers(normalizedEmail || undefined)) {
            const key = member.member_number || member.member_id || String(member.id);
            merged.set(key, { ...(merged.get(key) || member), ...member });
        }
        return Array.from(merged.values())
            .sort((left, right) => new Date(right.enrollment_date).getTime() - new Date(left.enrollment_date).getTime())
            .slice(0, limit)
            .map((member) => ({
            ...member,
            lifetimePoints: member.lifetimePoints ?? member.points_balance,
        }));
    }
    async get(memberId, email) {
        const normalized = String(memberId || "").trim().toLowerCase();
        const members = await this.list(500, email);
        return (members.find((member) => [String(member.id), member.member_id, member.member_number, String(member.email || "")]
            .map((value) => value.trim().toLowerCase())
            .includes(normalized)) || null);
    }
    async profile(memberId, email) {
        const activity = await this.points.activity(memberId, email);
        return activity.profile;
    }
    async tier(memberId, email) {
        const activity = await this.points.activity(memberId, email);
        return activity.balance.tier;
    }
    async notifications(memberId, limit = 20) {
        const state = await this.runtime.read();
        return (state.notifications || [])
            .filter((row) => !row.memberId || row.memberId === memberId)
            .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
            .slice(0, limit);
    }
    async preferences(memberId, patch) {
        return this.runtime.update((state) => {
            const current = state.communicationPreferences[memberId] || {
                sms: true,
                email: true,
                push: true,
                promotionalOptIn: true,
                frequency: "weekly",
            };
            const preference = { ...current, ...patch };
            state.communicationPreferences[memberId] = preference;
            return preference;
        });
    }
};
exports.MembersService = MembersService;
exports.MembersService = MembersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [points_service_1.PointsService,
        local_runtime_service_1.LocalRuntimeService,
        supabase_service_1.SupabaseService])
], MembersService);
//# sourceMappingURL=members.service.js.map