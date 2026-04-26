import { Injectable } from "@nestjs/common";
import { PointsService } from "../points/points.service";
import { LocalRuntimeService } from "../local-runtime/local-runtime.service";
import { nowIso } from "../common/utils";

const READ_CACHE_TTL_MS = 5_000;

type MemberListItem = {
  id: string;
  memberNumber: string;
  name: string;
  email: string;
  mobile: string;
  memberSince: string;
  tier: string;
  points: number;
  lifetimePoints: number;
  segment: string;
  status: "Active" | "Inactive";
};

@Injectable()
export class MembersService {
  private listCache: { loadedAt: number; value: MemberListItem[] } | null = null;
  private notificationsCache = new Map<string, { loadedAt: number; value: Array<Record<string, unknown>> }>();

  constructor(
    private readonly points: PointsService,
    private readonly runtime: LocalRuntimeService,
  ) {}

  private isFresh(loadedAt: number) {
    return Date.now() - loadedAt < READ_CACHE_TTL_MS;
  }

  private clearReadCaches() {
    this.listCache = null;
    this.notificationsCache.clear();
  }

  async profile(memberId: string, email?: string) {
    const activity = await this.points.activity(memberId, email);
    const profile = activity.profile as Record<string, unknown>;
    const fullName = `${String(profile.first_name || "").trim()} ${String(profile.last_name || "").trim()}`.trim();
    return {
      id: String(profile.member_number || profile.member_id || memberId),
      name: fullName || String(profile.member_number || profile.member_id || memberId),
      email: String(profile.email || email || ""),
      mobile: String(profile.mobile || profile.phone || ""),
      memberSince: String(profile.member_since || profile.enrollment_date || ""),
      tier: String(profile.tier || "Bronze"),
      points: Number(profile.points_balance || 0),
      lifetimePoints: Number(profile.lifetime_points || 0),
      segment: String(profile.segment || "Active"),
      surveysCompleted: Number(profile.surveys_completed || 0),
      status: String(profile.status || "Active"),
      birthdate: profile.birthdate || null,
      address: profile.address || null,
    };
  }

  async tier(memberId: string, email?: string) {
    const activity = await this.points.activity(memberId, email);
    return activity.balance.tier;
  }

  async notifications(memberId: string, limit = 20): Promise<Array<Record<string, unknown>>> {
    const cacheKey = `${memberId}:${limit}`;
    const cached = this.notificationsCache.get(cacheKey);
    if (cached && this.isFresh(cached.loadedAt)) {
      return cached.value;
    }

    const state = await this.runtime.read();
    const value = (state.notifications || [])
      .filter((row) => !row.memberId || row.memberId === memberId)
      .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
      .slice(0, limit);
    this.notificationsCache.set(cacheKey, { loadedAt: Date.now(), value });
    return value;
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
      this.clearReadCaches();
      return preference;
    });
  }

  async list(): Promise<MemberListItem[]> {
    if (this.listCache && this.isFresh(this.listCache.loadedAt)) {
      return this.listCache.value;
    }

    const state = await this.runtime.read();
    const value = Object.values(state.members)
      .map((member) => ({
        id: member.memberId,
        memberNumber: member.memberNumber,
        name: member.name,
        email: member.email,
        mobile: member.mobile,
        memberSince: member.memberSince,
        tier: member.tier,
        points: member.points,
        lifetimePoints: member.lifetimePoints,
        segment: member.segment,
        status: member.status,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));

    this.listCache = { loadedAt: Date.now(), value };
    return value;
  }

  async updateSegment(memberId: string, segment: string) {
    return this.runtime.update((state) => {
      const member = state.members[memberId];
      if (!member) {
        state.members[memberId] = {
          id: memberId,
          memberId,
          memberNumber: memberId,
          name: memberId,
          email: "",
          mobile: "",
          memberSince: nowIso(),
          tier: state.pointMembers[memberId]?.tier || "Bronze",
          points: state.pointMembers[memberId]?.pointsBalance || 0,
          lifetimePoints: state.pointMembers[memberId]?.history?.filter((item) => Number(item.points || 0) > 0).reduce((sum, item) => sum + Number(item.points || 0), 0) || 0,
          segment,
          status: "Active",
          surveysCompleted: 0,
        };
      } else {
        member.segment = segment;
      }
      this.clearReadCaches();
      return state.members[memberId];
    });
  }
}
