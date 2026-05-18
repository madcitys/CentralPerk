import { z } from "zod";
import {
  assignMembersToSegment,
  createCustomSegment,
  fetchMembersInSegment,
  removeMembersFromSegment,
  updateCustomSegment,
} from "../app/lib/member-lifecycle";
import { createApiHandler } from "./route-utils";
import { previewSegmentAudience, type SegmentPreviewCondition } from "./segment-preview";

const conditionSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    field: z.enum(["Tier", "Last Activity", "Points Balance"]),
    operator: z.string().trim().min(1).max(32),
    value: z.string().trim().min(1).max(120),
  })
  .strict();

export const saveSegmentSchema = z
  .object({
    id: z.string().trim().max(80).optional(),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(240).optional(),
    logicMode: z.enum(["AND", "OR"]).optional(),
    conditions: z.array(conditionSchema).max(12).optional(),
  })
  .strict();

export const previewSegmentSchema = z
  .object({
    logicMode: z.enum(["AND", "OR"]),
    conditions: z.array(conditionSchema).min(1).max(12),
  })
  .strict();

async function syncSegmentMembers(segmentId: string, previewMembers: Array<{ id: string }>) {
  const existingRows = await fetchMembersInSegment(segmentId).catch(() => []);
  const existingIds = (existingRows as Array<{ member_id?: string | number }>)
    .map((row) => row.member_id)
    .filter((value): value is string | number => value !== undefined && value !== null);

  if (existingIds.length > 0) {
    await removeMembersFromSegment(existingIds, segmentId).catch(() => undefined);
  }

  if (previewMembers.length > 0) {
    await assignMembersToSegment(
      previewMembers.map((member) => Number(member.id)),
      segmentId,
    );
  }
}

export const segmentsHandler = createApiHandler({
  route: "/api/segments",
  methods: ["POST"] as const,
  schema: saveSegmentSchema,
  rateLimit: { limit: 20, windowMs: 60_000 },
  resolveActor: (body) => body.name,
  summarize: (body) => ({
    segmentName: body.name,
    conditions: body.conditions?.length ?? 0,
  }),
  handler: async ({ body }) => {
    const segment = body.id
      ? await updateCustomSegment(body.id, { name: body.name, description: body.description })
      : await createCustomSegment({ name: body.name, description: body.description });

    let preview: { count: number; members: Array<{ id: string }> } | null = null;
    if (body.logicMode && body.conditions?.length) {
      preview = await previewSegmentAudience({
        logicMode: body.logicMode,
        conditions: body.conditions as SegmentPreviewCondition[],
      });
      await syncSegmentMembers(segment.id, preview.members);
    }

    return {
      ok: true as const,
      segment,
      preview,
    };
  },
});

export const previewSegmentHandler = createApiHandler({
  route: "/api/segments/preview",
  methods: ["POST"] as const,
  schema: previewSegmentSchema,
  rateLimit: { limit: 30, windowMs: 60_000 },
  summarize: (body) => ({
    logicMode: body.logicMode,
    conditions: body.conditions.length,
  }),
  handler: async ({ body }) => ({
    ok: true as const,
    preview: await previewSegmentAudience({
      logicMode: body.logicMode,
      conditions: body.conditions as SegmentPreviewCondition[],
    }),
  }),
});
