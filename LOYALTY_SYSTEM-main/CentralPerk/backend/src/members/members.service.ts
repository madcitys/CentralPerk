import { Injectable } from "@nestjs/common";
import { PointsService } from "../points/points.service";
import { LocalRuntimeService } from "../local-runtime/local-runtime.service";

@Injectable()
export class MembersService {
  constructor(
    private readonly points: PointsService,
    private readonly runtime: LocalRuntimeService,
  ) {}

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
