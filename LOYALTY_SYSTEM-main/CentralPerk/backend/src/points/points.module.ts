import { Module } from "@nestjs/common";
import { PointsController } from "./points.controller";
import { EventsController } from "./events.controller";
import { PointsService } from "./points.service";
import { TiersModule } from "../tiers/tiers.module";

@Module({
  imports: [TiersModule],
  controllers: [PointsController, EventsController],
  providers: [PointsService],
  exports: [PointsService],
})
export class PointsModule {}
