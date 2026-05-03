import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { PurchasesService } from "./purchases.service";

@Controller("purchases")
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Post()
  async create(@Body() body: Record<string, unknown>) {
    return { ok: true, ...(await this.purchases.create(body || {})) };
  }

  @Get()
  async list(@Query("memberId") memberId?: string) {
    return { ok: true, purchases: await this.purchases.list(memberId), source: "local_runtime" };
  }
}
