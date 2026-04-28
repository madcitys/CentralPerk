import { z } from "zod";
import {
  assignMembersToSegment,
  createCustomSegment,
  fetchAllSegments,
  fetchMembersInSegment,
  removeMembersFromSegment,
  updateCustomSegment,
} from "../app/lib/member-lifecycle";
import { createApiHandler } from "./route-utils";
import { HttpError } from "./http-error";
import { previewSegmentAudience, type SegmentPreviewCondition } from "./segment-preview";
import { listLocalSegments, saveLocalSegment } from "./local-segments";

function normalizeLogicMode(value: unknown) {
  const normalized = String(value || "AND").trim().toUpperCase();
  return normalized === "OR" ? "OR" : "AND";
}

function normalizeSegmentField(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (normalized === "tier") return "Tier";
  if (normalized === "last activity" || normalized === "last activity at") return "Last Activity";
  if (normalized === "points" || normalized === "point balance" || normalized === "points balance") return "Points Balance";
  return value;
}

function conditionId(input: { field: string; operator: string; value: string }) {
  return `${input.field}-${input.operator}-${input.value}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "condition";
}

const conditionSchema = z
  .object({
    id: z.preprocess(
      (value) => {
        const trimmed = String(value ?? "").trim();
        return trimmed || undefined;
      },
      z.string().trim().min(1).max(80).optional(),
    ),
    field: z.preprocess(normalizeSegmentField, z.enum(["Tier", "Last Activity", "Points Balance"])),
    operator: z.string().trim().min(1).max(32),
    value: z.string().trim().min(1).max(120),
  })
  .strict()
  .transform((condition) => ({
    ...condition,
    id: condition.id || conditionId(condition),
  }));

export const saveSegmentSchema = z
  .object({
    id: z.string().trim().max(80).optional(),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(240).optional(),
    logicMode: z.preprocess(normalizeLogicMode, z.enum(["AND", "OR"])).optional(),
    conditions: z.array(conditionSchema).max(12).optional(),
  })
  .strict();

export const previewSegmentSchema = z
  .object({
    logicMode: z.preprocess(normalizeLogicMode, z.enum(["AND", "OR"])),
    conditions: z.array(conditionSchema).min(1).max(12),
  })
  .strict();

function useLocalRuntimeFirst() {
  return (
    process.env.USE_REMOTE_LOYALTY_API !== "true" &&
    (process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true" || process.env.USE_LOCAL_LOYALTY_API === "true")
  );
}

async function syncSegmentMembers(segmentId: string, previewMembers: Array<{ id: string }>) {
  const existingRows = await fetchMembersInSegment(segmentId).catch(() => []);
  const existingIds = (existingRows as Array<{ member_id?: string | number }>)
    .map((row) => row.member_id)
    .filter((value): value is string | number => value !== undefined && value !== null);

  if (existingIds.length > 0) {
    await removeMembersFromSegment(existingIds, segmentId).catch(() => undefined);
  }

  const numericMemberIds = previewMembers
    .map((member) => Number(member.id))
    .filter((value) => Number.isFinite(value));

  if (numericMemberIds.length > 0) {
    await assignMembersToSegment(
      numericMemberIds,
      segmentId,
    );
  }
}

export const segmentsHandler = createApiHandler({
  route: "/api/segments",
  methods: ["GET", "POST"] as const,
  parseBodyFromQuery: true,
  rateLimit: { limit: 20, windowMs: 60_000 },
  resolveActor: (body) => (body as any).name || "segments",
  summarize: (body) => ({
    segmentName: (body as any).name || null,
    conditions: Array.isArray((body as any).conditions) ? (body as any).conditions.length : 0,
  }),
  handler: async ({ body, req }) => {
    if (req.method?.toUpperCase() === "GET") {
      if (useLocalRuntimeFirst()) {
        return { ok: true as const, segments: await listLocalSegments(), source: "local_runtime" };
      }

      try {
        return { ok: true as const, segments: await fetchAllSegments() };
      } catch {
        return { ok: true as const, segments: await listLocalSegments(), source: "local_runtime" };
      }
    }

    const parsed = saveSegmentSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, "Invalid segment payload.");
    const input = parsed.data;

    let preview: { count: number; members: Array<{ id: string }> } | null = null;
    if (input.logicMode && input.conditions?.length) {
      preview = await previewSegmentAudience({
        logicMode: input.logicMode,
        conditions: input.conditions as SegmentPreviewCondition[],
      });
    }

    if (useLocalRuntimeFirst()) {
      const segment = await saveLocalSegment({
        ...input,
        conditions: input.conditions as SegmentPreviewCondition[] | undefined,
        memberIds: preview?.members.map((member) => member.id),
      });
      return { ok: true as const, segment, segmentId: segment.id, preview };
    }

    try {
      const segment = input.id
        ? await updateCustomSegment(input.id, { name: input.name, description: input.description })
        : await createCustomSegment({ name: input.name, description: input.description });

      if (preview) {
        await syncSegmentMembers(segment.id, preview.members).catch(() => undefined);
      }

      return {
        ok: true as const,
        segment,
        segmentId: segment.id,
        preview,
      };
    } catch {
      const segment = await saveLocalSegment({
        ...input,
        conditions: input.conditions as SegmentPreviewCondition[] | undefined,
        memberIds: preview?.members.map((member) => member.id),
      });
      return { ok: true as const, segment, segmentId: segment.id, preview, source: "local_runtime" };
    }
  },
});

export const previewSegmentHandler = createApiHandler({
  route: "/api/segments/preview",
  methods: ["GET", "POST"] as const,
  parseBodyFromQuery: true,
  rateLimit: { limit: 30, windowMs: 60_000 },
  summarize: (body) => ({
    logicMode: (body as any).logicMode || null,
    conditions: Array.isArray((body as any).conditions) ? (body as any).conditions.length : 0,
  }),
  handler: async ({ body, req }) => {
    let queryConditions: unknown[] = [];
    if (req.method?.toUpperCase() === "GET" && typeof req.query.conditions === "string") {
      try {
        queryConditions = JSON.parse(req.query.conditions);
      } catch {
        throw new HttpError(400, "Invalid segment preview rules.");
      }
    }

    const rawPayload =
      req.method?.toUpperCase() === "GET"
        ? {
            logicMode: typeof req.query.logicMode === "string" ? req.query.logicMode : "AND",
            conditions: queryConditions,
          }
        : body;

    const parsed = previewSegmentSchema.safeParse(rawPayload);
    if (!parsed.success) throw new HttpError(400, "Invalid segment preview rules.");

    return {
      ok: true as const,
      preview: await previewSegmentAudience({
        logicMode: parsed.data.logicMode,
        conditions: parsed.data.conditions as SegmentPreviewCondition[],
      }),
    };
  },
});
