import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ReferralsService } from "./referrals.service";

@Controller("referrals")
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Post()
  async create(@Body() body: Record<string, unknown>) {
    return { ok: true, ...(await this.referrals.create(body || {})) };
  }

  @Get()
  async list(@Query("memberId") memberId?: string) {
    return { ok: true, referrals: await this.referrals.list(memberId), source: "local_runtime" };
  }
}
