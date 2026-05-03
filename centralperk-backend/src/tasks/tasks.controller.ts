import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { TasksService } from "./tasks.service";

@Controller("tasks")
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  async list(@Query("memberId") memberId?: string) {
    return { ok: true, tasks: await this.tasks.list(memberId), source: "local_runtime" };
  }

  @Post(":id/start")
  async start(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return { ok: true, ...(await this.tasks.start(id, body || {})) };
  }

  @Post(":id/submit")
  async submit(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return { ok: true, ...(await this.tasks.submit(id, body || {})) };
  }
}
