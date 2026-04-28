import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { MembersService } from "./members.service";

@Controller("members")
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get(":id/profile")
  async profile(@Param("id") id: string, @Query("email") email?: string) {
    return { ok: true, memberId: id, profile: await this.members.profile(id, email) };
  }

  @Get(":id/tier")
  async tier(@Param("id") id: string, @Query("email") email?: string) {
    return { ok: true, memberId: id, tier: await this.members.tier(id, email) };
  }

  @Get(":id/notifications")
  async notifications(@Param("id") id: string, @Query("limit") limit?: string) {
    return {
      ok: true,
      memberId: id,
      notifications: await this.members.notifications(id, Math.min(100, Math.max(1, Number(limit || 20)))),
    };
  }

  @Patch(":id/preferences")
  async preferences(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return { ok: true, memberId: id, preference: await this.members.preferences(id, body || {}) };
  }
}
