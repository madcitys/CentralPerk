import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { RewardsService } from "./rewards.service";
import { PointsService } from "../points/points.service";

@Controller("rewards")
export class RewardsController {
  constructor(
    private readonly rewards: RewardsService,
    private readonly points: PointsService,
  ) {}

  @Get()
  async list() {
    return { ok: true, rewards: await this.rewards.list(), source: "local_runtime" };
  }

  @Get("active")
  async active(@Query("tier") tier?: string) {
    return { ok: true, rewards: await this.rewards.active(tier), source: "local_runtime" };
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return { ok: true, reward: await this.rewards.get(id) };
  }

  @Post("redeem")
  async redeem(@Body() body: Record<string, unknown>) {
    const rewardId = body.rewardCatalogId ? String(body.rewardCatalogId) : body.rewardId ? String(body.rewardId) : null;
    const reward = rewardId ? await this.rewards.get(rewardId).catch(() => null) : null;
    const result = await this.points.redeem({
      memberIdentifier: String(body.memberIdentifier || body.memberId || body.email || ""),
      fallbackEmail: body.email ? String(body.email) : undefined,
      points: Number(body.points || body.pointsCost || reward?.pointsCost || 0),
      reason: body.reason ? String(body.reason) : "Reward redemption",
      transactionType: body.transactionType ? String(body.transactionType) : "REDEEM",
      rewardCatalogId: rewardId || undefined,
    });
    return { ok: true, result };
  }
}
