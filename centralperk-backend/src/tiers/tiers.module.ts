import { Module } from "@nestjs/common";
import { TiersService } from "./tiers.service";
import { TiersController } from "./tiers.controller";

@Module({
  controllers: [TiersController],
  providers: [TiersService],
  exports: [TiersService],
})
export class TiersModule {}
