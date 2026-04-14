import { z } from "zod";
import { awardMemberPoints, redeemMemberPoints } from "../app/lib/loyalty-supabase";
import { runWithIdempotency } from "./idempotency";
import { HttpError } from "./http-error";
import { createApiHandler, getIdempotencyKey } from "./route-utils";

const trimmedString = z.string().trim().min(1).max(160);
const optionalTrimmedString = (max: number) => z.string().trim().max(max).optional();

export const awardPointsSchema = z
  .object({
    memberIdentifier: trimmedString.max(80),
    fallbackEmail: z.string().trim().email().max(254).optional(),
    points: z.number().int().min(0).max(1_000_000),
    transactionType: z.enum(["PURCHASE", "MANUAL_AWARD", "EARN"]),
    reason: trimmedString.max(240),
    amountSpent: z.number().min(0).max(10_000_000).optional(),
    productCode: optionalTrimmedString(80),
    productCategory: optionalTrimmedString(80),
  })
  .strict();

export const redeemPointsSchema = z
  .object({
    memberIdentifier: trimmedString.max(80),
    fallbackEmail: z.string().trim().email().max(254).optional(),
    points: z.number().int().min(1).max(1_000_000),
    reason: trimmedString.max(240),
    transactionType: z.enum(["REDEEM", "GIFT"]).optional(),
    rewardCatalogId: z.union([z.string().trim().max(80), z.number().int()]).nullable().optional(),
    promotionCampaignId: z.string().trim().max(80).nullable().optional(),
  })
  .strict();

export const transactionCompletedSchema = z
  .object({
    eventId: trimmedString.max(120),
    eventType: z.literal("transaction.completed").default("transaction.completed"),
    memberIdentifier: trimmedString.max(80),
    fallbackEmail: z.string().trim().email().max(254).optional(),
    amountSpent: z.number().min(0).max(10_000_000),
    reason: trimmedString.max(240).optional(),
    productCode: optionalTrimmedString(80),
    productCategory: optionalTrimmedString(80),
  })
  .strict();

export const awardPointsHandler = createApiHandler({
  route: "/api/points/award",
  methods: ["POST"] as const,
  schema: awardPointsSchema,
  rateLimit: { limit: 40, windowMs: 60_000 },
  resolveActor: (body) => body.memberIdentifier,
  summarize: (body) => ({
    memberIdentifier: body.memberIdentifier,
    transactionType: body.transactionType,
    points: body.points,
  }),
  handler: async ({ req, body }) => {
    // Award writes must be idempotent because POS/event retries can replay the same request.
    const idempotencyKey = getIdempotencyKey(req);
    if (!idempotencyKey) {
      throw new HttpError(400, "Idempotency-Key header is required for award calls.");
    }

    const result = await runWithIdempotency({
      route: "/api/points/award",
      idempotencyKey,
      payload: body,
      execute: async () => ({
        body: {
          ok: true as const,
          result: await awardMemberPoints(body),
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
  rateLimit: { limit: 40, windowMs: 60_000 },
  resolveActor: (body) => body.memberIdentifier,
  summarize: (body) => ({
    memberIdentifier: body.memberIdentifier,
    transactionType: body.transactionType ?? "REDEEM",
    points: body.points,
  }),
  handler: async ({ body }) => ({
    ok: true as const,
    result: await redeemMemberPoints({
      ...body,
      rewardCatalogId: body.rewardCatalogId ?? undefined,
    }),
  }),
});

export const transactionCompletedHandler = createApiHandler({
  route: "/api/events/transaction-completed",
  methods: ["POST"] as const,
  schema: transactionCompletedSchema,
  rateLimit: { limit: 30, windowMs: 60_000 },
  resolveActor: (body) => body.memberIdentifier,
  summarize: (body) => ({
    eventId: body.eventId,
    eventType: body.eventType,
    memberIdentifier: body.memberIdentifier,
    amountSpent: body.amountSpent,
  }),
  handler: async ({ body }) => {
    // The transaction.completed consumer funnels purchase events into the same award contract
    // used by POST /api/points/award, with the event ID acting as the idempotency key.
    const result = await runWithIdempotency({
      route: "/api/events/transaction-completed",
      idempotencyKey: body.eventId,
      payload: body,
      execute: async () => ({
        body: {
          ok: true as const,
          result: await awardMemberPoints({
            memberIdentifier: body.memberIdentifier,
            fallbackEmail: body.fallbackEmail,
            points: 0,
            transactionType: "PURCHASE",
            reason: body.reason || `Transaction completed (${body.eventId})`,
            amountSpent: body.amountSpent,
            productCode: body.productCode,
            productCategory: body.productCategory,
          }),
        },
      }),
    });

    return {
      ...result.body,
      replayed: result.replayed,
    };
  },
});
