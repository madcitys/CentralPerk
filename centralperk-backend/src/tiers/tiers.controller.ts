import { Controller, Get } from "@nestjs/common";
import { TiersService } from "./tiers.service";

@Controller("tiers")
export class TiersController {
  constructor(private readonly tiers: TiersService) {}

  @Get()
  async list() {
    return { ok: true, tiers: await this.tiers.listTiers() };
  }
}
