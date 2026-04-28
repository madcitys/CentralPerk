import { createHash } from "crypto";
import { z } from "zod";
import { awardMemberPoints, redeemMemberPoints } from "../app/lib/loyalty-supabase";
import { appendEventAuditLog } from "./audit-log";
import { runWithIdempotency } from "./idempotency";
import { HttpError } from "./http-error";
import { createApiHandler, getIdempotencyKey } from "./route-utils";
import { awardLocalPoints, redeemLocalPoints } from "./local-points";
import { DEFAULT_TIER_RULES } from "../app/lib/loyalty-engine";

const resolvedString = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !value.includes("{{") && !value.includes("}}"), {
      message: "Request variable is unresolved. Use a real value or a valid environment variable name.",
    });
const trimmedString = resolvedString(160);
const optionalTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !value.includes("{{") && !value.includes("}}"), {
      message: "Request variable is unresolved. Use a real value or a valid environment variable name.",
    })
    .optional();

function requireMemberIdentity<T extends { memberIdentifier?: string; fallbackEmail?: string }>(
  body: T,
): Omit<T, "memberIdentifier"> & { memberIdentifier: string } {
  return {
    ...body,
    memberIdentifier: String(body.memberIdentifier || body.fallbackEmail || "").trim(),
  };
}

export const awardPointsSchema = z
  .object({
    memberIdentifier: optionalTrimmedString(80),
    fallbackEmail: z.string().trim().email().max(254).optional(),
    points: z.coerce.number().int().min(0).max(1_000_000),
    transactionType: z.enum(["PURCHASE", "MANUAL_AWARD", "EARN"]),
    reason: trimmedString.max(240),
    transactionRef: trimmedString.max(120).optional(),
    transactionReference: trimmedString.max(120).optional(),
    reference: trimmedString.max(120).optional(),
    amountSpent: z.coerce.number().min(0).max(10_000_000).optional(),
    productCode: optionalTrimmedString(80),
    productCategory: optionalTrimmedString(80),
  })
  .strict()
  .refine((body) => Boolean(body.memberIdentifier || body.fallbackEmail), {
    message: "memberIdentifier or fallbackEmail is required.",
    path: ["memberIdentifier"],
  })
  .transform(requireMemberIdentity);

type AwardPointsInput = z.infer<typeof awardPointsSchema>;

export const redeemPointsSchema = z
  .object({
    memberIdentifier: optionalTrimmedString(80),
    fallbackEmail: z.string().trim().email().max(254).optional(),
    points: z.coerce.number().int().min(1).max(1_000_000),
    reason: trimmedString.max(240),
    transactionType: z.enum(["REDEEM", "GIFT"]).optional(),
    rewardCatalogId: z.union([z.string().trim().max(80), z.number().int()]).nullable().optional(),
    promotionCampaignId: z.string().trim().max(80).nullable().optional(),
  })
  .strict()
  .refine((body) => Boolean(body.memberIdentifier || body.fallbackEmail), {
    message: "memberIdentifier or fallbackEmail is required.",
    path: ["memberIdentifier"],
  })
  .transform(requireMemberIdentity);

export const transactionCompletedSchema = z
  .object({
    eventId: trimmedString.max(120).optional(),
    eventType: z.literal("transaction.completed").default("transaction.completed"),
    transactionReference: trimmedString.max(120).optional(),
    transactionRef: trimmedString.max(120).optional(),
    reference: trimmedString.max(120).optional(),
    memberIdentifier: optionalTrimmedString(80),
    fallbackEmail: z.string().trim().email().max(254).optional(),
    amountSpent: z.coerce.number().min(0).max(10_000_000),
    reason: trimmedString.max(240).optional(),
    productCode: optionalTrimmedString(80),
    productCategory: optionalTrimmedString(80),
  })
  .refine((body) => Boolean(body.transactionReference || body.transactionRef || body.reference || body.eventId), {
    message: "transactionReference is required for transaction.completed events.",
    path: ["transactionReference"],
  })
  .refine((body) => Boolean(body.memberIdentifier || body.fallbackEmail), {
    message: "memberIdentifier or fallbackEmail is required.",
    path: ["memberIdentifier"],
  })
  .strict()
  .transform(requireMemberIdentity);

function resolveTransactionReference(body: z.infer<typeof transactionCompletedSchema>) {
  return String(body.transactionReference || body.transactionRef || body.reference || body.eventId || "").trim();
}

function normalizeRedeemError(error: unknown): never {
  const message = String(error instanceof Error ? error.message : error || "");
  if (message.toLowerCase().includes("not enough points") || message.toLowerCase().includes("insufficient")) {
    throw new HttpError(409, "Insufficient points balance.");
  }
  throw error;
}

function useLocalRuntimeFirst() {
  return (
    process.env.USE_REMOTE_LOYALTY_API !== "true" &&
    (process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true" || process.env.USE_LOCAL_LOYALTY_API === "true")
  );
}

function demoIdempotencyKey(body: AwardPointsInput) {
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        memberIdentifier: body.memberIdentifier,
        points: body.points,
        transactionType: body.transactionType,
        reason: body.reason,
        amountSpent: body.amountSpent ?? null,
        productCode: body.productCode ?? null,
        productCategory: body.productCategory ?? null,
      }),
    )
    .digest("hex")
    .slice(0, 16);
  return `demo-award-${hash}`;
}

function resolveAwardIdempotencyKey(req: Parameters<typeof getIdempotencyKey>[0], body: AwardPointsInput) {
  const headerKey = getIdempotencyKey(req);
  if (headerKey?.trim()) return headerKey.trim();
  const bodyKey = String(body.transactionRef || body.transactionReference || body.reference || "").trim();
  if (bodyKey) return bodyKey;
  if (useLocalRuntimeFirst()) return demoIdempotencyKey(body);
  throw new HttpError(400, "Idempotency-Key header or transactionRef is required for award calls.");
}

export const awardPointsHandler = createApiHandler({
  route: "/api/points/award",
  methods: ["POST"] as const,
  schema: awardPointsSchema,
  parseBodyFromQuery: true,
  rateLimit: { limit: 40, windowMs: 60_000 },
  resolveActor: (body) => body.memberIdentifier,
  summarize: (body) => ({
    memberIdentifier: body.memberIdentifier,
    transactionType: body.transactionType,
    points: body.points,
  }),
  handler: async ({ req, body }) => {
    const idempotencyKey = resolveAwardIdempotencyKey(req, body);

    const result = await runWithIdempotency({
      route: "/api/points/award",
      idempotencyKey,
      payload: body,
      execute: async () => ({
        body: {
          ok: true as const,
          result: useLocalRuntimeFirst()
            ? await awardLocalPoints(body, idempotencyKey)
            : await awardMemberPoints(body, idempotencyKey).catch(() => awardLocalPoints(body, idempotencyKey)),
        },
      }),
    });

    return {
      ...result.body,
      replayed: result.replayed,
    };
  },
});

export const redeemPointsHandler = createApiHandler({
  route: "/api/points/redeem",
  methods: ["POST"] as const,
  schema: redeemPointsSchema,
  parseBodyFromQuery: true,
  rateLimit: { limit: 40, windowMs: 60_000 },
  resolveActor: (body) => body.memberIdentifier,
  summarize: (body) => ({
    memberIdentifier: body.memberIdentifier,
    transactionType: body.transactionType ?? "REDEEM",
    points: body.points,
  }),
  handler: async ({ body }) => {
    try {
      return {
        ok: true as const,
        result: useLocalRuntimeFirst()
          ? await redeemLocalPoints({
              ...body,
              rewardCatalogId: body.rewardCatalogId ?? undefined,
            })
          : await redeemMemberPoints({
              ...body,
              rewardCatalogId: body.rewardCatalogId ?? undefined,
            }).catch(() =>
              redeemLocalPoints({
                ...body,
                rewardCatalogId: body.rewardCatalogId ?? undefined,
              }),
            ),
      };
    } catch (error) {
      normalizeRedeemError(error);
    }
  },
});

export const pointsTiersHandler = createApiHandler({
  route: "/api/points/tiers",
  methods: ["GET"] as const,
  rateLimit: { limit: 120, windowMs: 60_000 },
  handler: async () => ({
    ok: true as const,
    tiers: DEFAULT_TIER_RULES,
    source: "local_runtime",
  }),
});

export const transactionCompletedHandler = createApiHandler({
  route: "/api/events/transaction-completed",
  methods: ["POST"] as const,
  schema: transactionCompletedSchema,
  parseBodyFromQuery: true,
  rateLimit: { limit: 30, windowMs: 60_000 },
  resolveActor: (body) => body.memberIdentifier,
  summarize: (body) => ({
    eventId: body.eventId,
    transactionReference: resolveTransactionReference(body),
    eventType: body.eventType,
    memberIdentifier: body.memberIdentifier,
    amountSpent: body.amountSpent,
  }),
  handler: async ({ body }) => {
    const transactionReference = resolveTransactionReference(body);
    const awardPayload = {
      memberIdentifier: body.memberIdentifier,
      fallbackEmail: body.fallbackEmail,
      points: 0,
      transactionType: "PURCHASE" as const,
      reason: body.reason || `Transaction completed (${transactionReference})`,
      amountSpent: body.amountSpent,
      productCode: body.productCode,
      productCategory: body.productCategory,
    };
    const result = await runWithIdempotency({
      route: "/api/points/award",
      idempotencyKey: transactionReference,
      payload: awardPayload,
      execute: async () => ({
        body: {
          ok: true as const,
          result: useLocalRuntimeFirst()
            ? await awardLocalPoints(awardPayload, transactionReference)
            : await awardMemberPoints(awardPayload, transactionReference).catch(() =>
                awardLocalPoints(awardPayload, transactionReference),
              ),
        },
      }),
    });

    await appendEventAuditLog({
      eventId: body.eventId || transactionReference,
      eventType: body.eventType,
      transactionReference,
      route: "/api/events/transaction-completed",
      actor: body.memberIdentifier,
      processedAt: new Date().toISOString(),
      status: result.replayed ? "replayed" : "processed",
      summary: {
        memberIdentifier: body.memberIdentifier,
        amountSpent: body.amountSpent,
        productCode: body.productCode || null,
        productCategory: body.productCategory || null,
      },
    });

    return {
      ...result.body,
      replayed: result.replayed,
    };
  },
});
