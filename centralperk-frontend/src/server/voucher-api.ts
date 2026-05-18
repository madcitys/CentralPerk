import { z } from "zod";
import { createApiHandler } from "./route-utils";
import { HttpError } from "./http-error";
import { createVoucherRecord, getVoucherRecord, listVoucherRecords, validateVoucherRecord } from "./voucher-service";

const trimmedString = (max: number) => z.string().trim().min(1).max(max);
const optionalTrimmedString = (max: number) => z.string().trim().max(max).nullable().optional();

export const voucherCreateSchema = z
  .object({
    id: trimmedString(120),
    memberId: trimmedString(80),
    memberEmail: z.string().trim().email().max(254).nullable().optional(),
    rewardId: trimmedString(80),
    rewardCatalogId: optionalTrimmedString(80),
    rewardName: trimmedString(180),
    pointsCost: z.number().int().min(0).max(1_000_000),
    method: z.enum(["in-store", "online"]),
    voucherCode: trimmedString(80),
    orderId: trimmedString(120),
    qrValue: trimmedString(1000),
    qrTargetUrl: trimmedString(1000),
    createdAt: trimmedString(80),
    partnerLabel: optionalTrimmedString(120),
    deliveryPartner: optionalTrimmedString(80),
    deliveryAddress: optionalTrimmedString(500),
    deliveryNotes: optionalTrimmedString(500),
    contactNumber: optionalTrimmedString(40),
    status: z.enum(["ready", "processing", "validated"]),
    validatedAt: z.string().trim().max(80).nullable().optional(),
  })
  .strict();

export const voucherValidateSchema = z
  .object({
    action: z.literal("validate"),
    voucherCode: trimmedString(80),
  })
  .strict();

export const vouchersHandler = createApiHandler({
  route: "/api/vouchers",
  methods: ["GET", "POST"] as const,
  rateLimit: { limit: 60, windowMs: 60_000 },
  resolveActor: (body, req) =>
    typeof req.query.memberId === "string"
      ? req.query.memberId
      : typeof body?.memberId === "string"
        ? body.memberId
        : null,
  summarize: (body, req) => ({
    memberId: (typeof req.query.memberId === "string" ? req.query.memberId : body?.memberId) ?? null,
    method: body?.method ?? null,
  }),
  handler: async ({ req, body }) => {
    const method = String(req.method || "GET").toUpperCase();

    if (method === "GET") {
      return {
        ok: true as const,
        vouchers: await listVoucherRecords({
          memberId: typeof req.query.memberId === "string" ? req.query.memberId : undefined,
          memberEmail: typeof req.query.email === "string" ? req.query.email : undefined,
        }),
      };
    }

    if (!body) {
      throw new HttpError(400, "Voucher payload is required.");
    }

    const payload = voucherCreateSchema.parse(body);

    return {
      ok: true as const,
      voucher: await createVoucherRecord({
        ...payload,
        memberEmail: payload.memberEmail ?? null,
        rewardCatalogId: payload.rewardCatalogId ?? null,
        partnerLabel: payload.partnerLabel ?? null,
        deliveryPartner: payload.deliveryPartner ?? null,
        deliveryAddress: payload.deliveryAddress ?? null,
        deliveryNotes: payload.deliveryNotes ?? null,
        contactNumber: payload.contactNumber ?? null,
        validatedAt: payload.validatedAt ?? null,
      }),
    };
  },
});

export const voucherByIdHandler = createApiHandler({
  route: "/api/vouchers/:id",
  methods: ["GET", "PATCH"] as const,
  rateLimit: { limit: 60, windowMs: 60_000 },
  resolveActor: (_body, req) => String(req.query.id || ""),
  summarize: (_body, req) => ({
    voucherId: String(req.query.id || ""),
  }),
  handler: async ({ req, body }) => {
    const voucherId = String(req.query.id || "").trim();
    if (!voucherId) {
      throw new HttpError(400, "Voucher ID is required.");
    }

    const method = String(req.method || "GET").toUpperCase();
    if (method === "GET") {
      const voucher = await getVoucherRecord(voucherId);
      if (!voucher) {
        throw new HttpError(404, "Voucher not found.");
      }

      return {
        ok: true as const,
        voucher,
      };
    }

    if (!body) {
      throw new HttpError(400, "Validation payload is required.");
    }

    const payload = voucherValidateSchema.parse(body);

    return {
      ok: true as const,
      voucher: await validateVoucherRecord({
        voucherId,
        voucherCode: payload.voucherCode,
      }),
    };
  },
});
