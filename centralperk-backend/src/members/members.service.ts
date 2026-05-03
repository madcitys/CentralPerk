import { Injectable } from "@nestjs/common";
import { PointsService } from "../points/points.service";
import { LocalRuntimeService } from "../local-runtime/local-runtime.service";
import { SupabaseService } from "../supabase/supabase.service";

type MemberRow = {
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
  lifetimePoints?: number;
};

function normalizeMember(row: Record<string, unknown>): MemberRow {
  const databaseId = row.id ?? row.member_id ?? row.memberId ?? row.member_number ?? row.memberNumber ?? "";
  const memberId = String(row.member_id || row.memberId || row.member_number || row.memberNumber || row.id || "");
  const memberNumber = String(row.member_number || row.memberNumber || memberId || row.id || "");
  const pointsBalance = Number(row.points_balance ?? row.pointsBalance ?? 0);
  return {
    id: databaseId as string | number,
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

@Injectable()
export class MembersService {
  constructor(
    private readonly points: PointsService,
    private readonly runtime: LocalRuntimeService,
    private readonly supabase: SupabaseService,
  ) {}

  private async localMembers() {
    const state = await this.runtime.read();
    return Object.values(state.pointMembers || {}).map((member) =>
      normalizeMember({
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
      }),
    );
  }

  private async supabaseMembers(email?: string) {
    const admin = this.supabase.admin;
    if (!admin) return [];
    let query = admin
      .from("loyalty_members")
      .select("id,member_id,member_number,first_name,last_name,email,phone,enrollment_date,points_balance,tier")
      .order("enrollment_date", { ascending: false });
    if (email) {
      query = query.eq("email", email);
    }
    const { data, error } = await query.limit(500);
    if (error) return [];
    return (data || []).map((row) => normalizeMember(row as unknown as Record<string, unknown>));
  }

  async list(limit = 100, email?: string) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const merged = new Map<string, MemberRow>();

    for (const member of await this.localMembers()) {
      if (normalizedEmail && String(member.email || "").trim().toLowerCase() !== normalizedEmail) continue;
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

  async get(memberId: string, email?: string) {
    const normalized = String(memberId || "").trim().toLowerCase();
    const members = await this.list(500, email);
    return (
      members.find((member) =>
        [String(member.id), member.member_id, member.member_number, String(member.email || "")]
          .map((value) => value.trim().toLowerCase())
          .includes(normalized),
      ) || null
    );
  }

  async profile(memberId: string, email?: string) {
    const activity = await this.points.activity(memberId, email);
    return activity.profile;
  }

  async tier(memberId: string, email?: string) {
    const activity = await this.points.activity(memberId, email);
    return activity.balance.tier;
  }

  async notifications(memberId: string, limit = 20) {
    const state = await this.runtime.read();
    return (state.notifications || [])
      .filter((row) => !row.memberId || row.memberId === memberId)
      .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
      .slice(0, limit);
  }

  async preferences(memberId: string, patch: Record<string, unknown>) {
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
}
