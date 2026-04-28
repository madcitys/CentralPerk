import { Module } from "@nestjs/common";
import { MembersController } from "./members.controller";
import { MembersService } from "./members.service";
import { PointsModule } from "../points/points.module";

@Module({
  imports: [PointsModule],
  controllers: [MembersController],
  providers: [MembersService],
})
export class MembersModule {}
