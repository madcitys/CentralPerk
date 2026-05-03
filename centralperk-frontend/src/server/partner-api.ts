import { z } from "zod";
import {
  createPartnerSettlement,
  buildPartnerDashboard,
  loadPartnerSettlement,
  loadPartnerSettlementByMonth,
  markPartnerSettlementPaid,
  normalizeSettlementMonth,
  recordPartnerTransaction,
} from "./partner-service";
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
    points: z.coerce.number().int().min(0).max(1_000_000),
    grossAmount: z.coerce.number().min(0).max(10_000_000),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export const partnerSettlementSchema = z
  .object({
    partnerId: z.string().trim().max(80).optional(),
    month: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
    commissionRate: z.coerce.number().min(0).max(1).optional(),
  })
  .strict();

export const partnerMonthlySettlementSchema = z
  .object({
    month: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
    commissionRate: z.coerce.number().min(0).max(1).optional(),
  })
  .strict();

export const partnerSettlementPaidSchema = z
  .object({
    paidAt: z.string().datetime().optional(),
  })
  .strict();

function getQueryValue(value: unknown) {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return typeof value === "string" ? value.trim() : "";
}

function requirePartnerId(req: { query: Record<string, unknown> }) {
  const partnerId = getQueryValue(req.query.id);
  if (!partnerId) throw new HttpError(400, "Partner ID is required.");
  return partnerId;
}

function requireSettlementMonth(req: { query: Record<string, unknown> }, body?: { month?: string }) {
  const rawMonth = body?.month || getQueryValue(req.query.month);
  if (!rawMonth) throw new HttpError(400, "Settlement month is required.");
  return normalizeSettlementMonth(rawMonth);
}

function buildSettlementPdf(settlement: Awaited<ReturnType<typeof loadPartnerSettlement>>) {
  if (!settlement) throw new HttpError(404, "Settlement not found.");
  return buildSimplePdf([
    "CentralPerk Partner Settlement",
    `Settlement ID: ${settlement.id}`,
    `Partner: ${settlement.partnerName} (${settlement.partnerCode})`,
    `Month: ${settlement.month}`,
    `Status: ${settlement.status}`,
    `Created At: ${settlement.createdAt}`,
    `Paid At: ${settlement.paidAt || "Not paid"}`,
    `Transactions: ${settlement.totalTransactions}`,
    `Total Points: ${settlement.totalPoints}`,
    `Gross Amount: PHP ${settlement.totalGrossAmount.toFixed(2)}`,
    `Commission Rate: ${(settlement.commissionRate * 100).toFixed(2)}%`,
    `Commission Amount: PHP ${settlement.commissionAmount.toFixed(2)}`,
  ]);
}

export const partnerTransactionsHandler = createApiHandler({
  route: "/api/partners/transactions",
  methods: ["POST"] as const,
  schema: partnerTransactionSchema,
  parseBodyFromQuery: true,
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

export const partnerDashboardByIdHandler = createApiHandler({
  route: "/api/partners/:id/dashboard",
  methods: ["GET"] as const,
  rateLimit: { limit: 60, windowMs: 60_000 },
  handler: async ({ req }) => {
    const partnerId = requirePartnerId(req);
    const [dashboard] = await buildPartnerDashboard(partnerId);
    if (!dashboard) throw new HttpError(404, "Partner not found.");
    return {
      ok: true as const,
      dashboard,
      partner: dashboard.partner,
      totals: dashboard.totals,
      settlements: dashboard.settlements,
      recentTransactions: dashboard.recentTransactions,
    };
  },
});

export const partnerSettlementsHandler = createApiHandler({
  route: "/api/partners/settlements",
  methods: ["POST"] as const,
  schema: partnerSettlementSchema,
  parseBodyFromQuery: true,
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

export const partnerMonthlySettlementHandler = createApiHandler({
  route: "/api/partners/:id/settlement",
  methods: ["POST"] as const,
  schema: partnerMonthlySettlementSchema,
  parseBodyFromQuery: true,
  rateLimit: { limit: 20, windowMs: 60_000 },
  resolveActor: (_body, req) => requirePartnerId(req),
  summarize: (body, req) => ({
    partnerId: getQueryValue(req.query.id),
    month: body.month || getQueryValue(req.query.month) || null,
    commissionRate: body.commissionRate ?? null,
  }),
  handler: async ({ body, req }) => {
    const partnerId = requirePartnerId(req);
    const month = requireSettlementMonth(req, body);
    return {
      ok: true as const,
      settlement: await createPartnerSettlement({
        partnerId,
        month,
        commissionRate: body.commissionRate,
      }),
    };
  },
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

    const pdf = buildSettlementPdf(settlement);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=\"partner-settlement-${settlement.id}.pdf\"`);
    res.status(200).send(pdf);
  },
});

export const partnerMonthlySettlementPdfHandler = createApiHandler({
  route: "/api/partners/:id/settlement/:month/pdf",
  methods: ["GET"] as const,
  rateLimit: { limit: 20, windowMs: 60_000 },
  handler: async ({ req, res }) => {
    const partnerId = requirePartnerId(req);
    const month = requireSettlementMonth(req);
    const settlement = await loadPartnerSettlementByMonth(partnerId, month);
    if (!settlement) throw new HttpError(404, "Settlement not found.");
    const pdf = buildSettlementPdf(settlement);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=\"partner-settlement-${partnerId}-${month}.pdf\"`);
    res.status(200).send(pdf);
  },
});

export const partnerSettlementPaidHandler = createApiHandler({
  route: "/api/partners/:id/settlement/:month/paid",
  methods: ["PATCH"] as const,
  schema: partnerSettlementPaidSchema,
  parseBodyFromQuery: true,
  rateLimit: { limit: 20, windowMs: 60_000 },
  resolveActor: (_body, req) => requirePartnerId(req),
  summarize: (body, req) => ({
    partnerId: getQueryValue(req.query.id),
    month: getQueryValue(req.query.month),
    paidAt: body.paidAt || null,
  }),
  handler: async ({ body, req }) => {
    const partnerId = requirePartnerId(req);
    const month = requireSettlementMonth(req);
    return {
      ok: true as const,
      settlement: await markPartnerSettlementPaid({
        partnerId,
        month,
        paidAt: body.paidAt,
      }),
    };
  },
});
