import { Module } from "@nestjs/common";
import { SegmentsController } from "./segments.controller";
import { SegmentsService } from "./segments.service";
import { PointsModule } from "../points/points.module";

@Module({
  imports: [PointsModule],
  controllers: [SegmentsController],
  providers: [SegmentsService],
})
export class SegmentsModule {}
