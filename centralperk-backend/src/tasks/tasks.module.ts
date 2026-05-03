import { Module } from "@nestjs/common";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";
import { PointsModule } from "../points/points.module";

@Module({
  imports: [PointsModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
