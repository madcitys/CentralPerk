import { Controller, Get, Param } from "@nestjs/common";
import { RewardsService } from "./rewards.service";

@Controller("rewards")
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Get()
  async list() {
    return { ok: true, rewards: await this.rewards.list(), source: "local_runtime" };
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return { ok: true, reward: await this.rewards.get(id) };
  }
}
