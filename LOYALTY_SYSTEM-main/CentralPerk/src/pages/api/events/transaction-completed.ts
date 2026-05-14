import type { NextApiRequest, NextApiResponse } from "next";

import { proxyToGateway } from "../../../server/service-proxy";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: { message: "Method not allowed." } });
  }

  const body = req.body ?? {};
  req.body = {
    memberIdentifier: body.memberIdentifier,
    fallbackEmail: body.fallbackEmail,
    points: 0,
    transactionType: "PURCHASE",
    reason: body.reason || `Transaction completed (${body.eventId || "event"})`,
    amountSpent: body.amountSpent,
    productCode: body.productCode,
    productCategory: body.productCategory,
  };
  req.headers["idempotency-key"] = String(body.eventId || req.headers["idempotency-key"] || "");

  return proxyToGateway(req, res, {
    targetPath: "/points/award",
    methods: ["POST"] as const,
  });
}
