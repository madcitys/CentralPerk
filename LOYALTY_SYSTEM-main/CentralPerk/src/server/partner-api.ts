import { z } from "zod";
import { createPartnerSettlement, buildPartnerDashboard, loadPartnerSettlement, recordPartnerTransaction } from "./partner-service";
import { buildSimplePdf } from "./pdf";
import { HttpError } from "./http-error";
import { createApiHandler } from "./route-utils";

export const partnerTransactionSchema = z
  .object({
    partnerId: z.string().trim().min(1).max(80),
    partnerCode: z.string().trim().min(1).max(40),
    partnerName: z.string().trim().min(1).max(160),
    memberId: z.string().trim().min(1).max(80),
    memberEmail: z.string().trim().email().max(254).optional(),
    orderId: z.string().trim().min(1).max(120),
    points: z.number().int().min(0).max(1_000_000),
    grossAmount: z.number().min(0).max(10_000_000),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export const partnerSettlementSchema = z
  .object({
    partnerId: z.string().trim().max(80).optional(),
    commissionRate: z.number().min(0).max(1).optional(),
  })
  .strict();

export const partnerTransactionsHandler = createApiHandler({
  route: "/api/partners/transactions",
  methods: ["POST"] as const,
  schema: partnerTransactionSchema,
  rateLimit: { limit: 25, windowMs: 60_000 },
  resolveActor: (body) => body.partnerId,
  summarize: (body) => ({
    partnerId: body.partnerId,
    orderId: body.orderId,
    points: body.points,
    grossAmount: body.grossAmount,
  }),
  handler: async ({ body }) => ({
    ok: true as const,
    transaction: await recordPartnerTransaction(body),
  }),
});

export const partnerDashboardHandler = createApiHandler({
  route: "/api/partners/dashboard",
  methods: ["GET"] as const,
  rateLimit: { limit: 60, windowMs: 60_000 },
  handler: async () => ({
    ok: true as const,
    partners: await buildPartnerDashboard(),
  }),
});

export const partnerSettlementsHandler = createApiHandler({
  route: "/api/partners/settlements",
  methods: ["POST"] as const,
  schema: partnerSettlementSchema,
  rateLimit: { limit: 20, windowMs: 60_000 },
  resolveActor: (body) => body.partnerId,
  summarize: (body) => ({
    partnerId: body.partnerId || null,
    commissionRate: body.commissionRate ?? null,
  }),
  handler: async ({ body }) => ({
    ok: true as const,
    settlement: await createPartnerSettlement(body),
  }),
});

export const partnerSettlementPdfHandler = createApiHandler({
  route: "/api/partners/settlements/:id/pdf",
  methods: ["GET"] as const,
  rateLimit: { limit: 20, windowMs: 60_000 },
  handler: async ({ req, res }) => {
    const settlementId = String(req.query.id || "").trim();
    if (!settlementId) throw new HttpError(400, "Settlement ID is required.");

    const settlement = await loadPartnerSettlement(settlementId);
    if (!settlement) throw new HttpError(404, "Settlement not found.");

    const pdf = buildSimplePdf([
      "CentralPerk Partner Settlement",
      `Settlement ID: ${settlement.id}`,
      `Partner: ${settlement.partnerName} (${settlement.partnerCode})`,
      `Created At: ${settlement.createdAt}`,
      `Transactions: ${settlement.totalTransactions}`,
      `Total Points: ${settlement.totalPoints}`,
      `Gross Amount: PHP ${settlement.totalGrossAmount.toFixed(2)}`,
      `Commission Rate: ${(settlement.commissionRate * 100).toFixed(2)}%`,
      `Commission Amount: PHP ${settlement.commissionAmount.toFixed(2)}`,
    ]);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=\"partner-settlement-${settlement.id}.pdf\"`);
    res.status(200).send(pdf);
  },
});
