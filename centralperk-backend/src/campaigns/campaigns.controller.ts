import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CampaignsService } from "./campaigns.service";

@Controller("campaigns")
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Post()
  async create(@Body() body: Record<string, unknown>, @Query() query: Record<string, unknown>) {
    const campaign = await this.campaigns.create({ ...query, ...body });
    return { ok: true, campaign, campaignId: campaign.id };
  }

  @Get()
  async list() {
    return { ok: true, campaigns: await this.campaigns.list(), source: "local_runtime" };
  }

  @Get("active")
  async active(@Query("tier") tier?: string) {
    return { ok: true, campaigns: await this.campaigns.active(tier) };
  }

  @Get("performance")
  async performance() {
    return { ok: true, performance: await this.campaigns.performance(), source: "local_runtime" };
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    const campaign = await this.campaigns.get(id);
    return { ok: true, campaign, campaignId: campaign.id };
  }

  @Patch(":id/publish")
  async publish(@Param("id") id: string) {
    const campaign = await this.campaigns.publish(id);
    return { ok: true, campaign, campaignId: campaign.id, notificationsQueued: 0 };
  }

  @Get(":id/budget-status")
  async budget(@Param("id") id: string) {
    const campaign = await this.campaigns.get(id);
    return { ok: true, budgetStatus: this.campaigns.budgetStatus(campaign), campaignId: campaign.id };
  }
}
