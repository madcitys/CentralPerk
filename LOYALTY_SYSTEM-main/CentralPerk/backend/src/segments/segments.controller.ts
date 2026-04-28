import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { SegmentsService } from "./segments.service";

@Controller("segments")
export class SegmentsController {
  constructor(private readonly segments: SegmentsService) {}

  @Get()
  async list() {
    return { ok: true, segments: await this.segments.list(), source: "local_runtime" };
  }

  @Post()
  async create(@Body() body: Record<string, unknown>, @Query() query: Record<string, unknown>) {
    const segment = await this.segments.create({ ...query, ...body });
    return { ok: true, segment, segmentId: segment.id };
  }

  @Post("preview")
  async preview(@Body() body: Record<string, unknown>, @Query() query: Record<string, unknown>) {
    return { ok: true, preview: await this.segments.preview({ ...query, ...body }) };
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return { ok: true, segment: await this.segments.update(id, body || {}) };
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    return { ok: true, ...(await this.segments.remove(id)) };
  }
}
