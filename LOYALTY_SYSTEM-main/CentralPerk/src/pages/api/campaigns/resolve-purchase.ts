import type { NextApiRequest, NextApiResponse } from "next";

import { gatewayBaseUrl } from "../../../server/service-proxy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: { message: "Method not allowed." } });
  }

  const payload = req.body ?? {};

  try {
    const upstream = await fetch(`${gatewayBaseUrl()}/campaigns/multiplier`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        memberIdentifier: String(payload.memberIdentifier || payload.memberId || "").trim(),
        fallbackEmail: payload.fallbackEmail,
        tier: payload.memberTier || payload.tier,
        amountSpent: Number(payload.purchaseAmount ?? payload.amountSpent ?? 0),
      }),
    });
    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) return res.status(upstream.status).json(data);

    const result = data?.result ?? {};
    const campaign =
      result.active && result.campaignId
        ? [
            {
              campaignId: String(result.campaignId),
              campaignName: "Active campaign",
              campaignType: "multiplier_event",
              awardedPoints: Number(result.bonusPoints ?? 0),
              appliedMultiplier: Number(result.multiplier ?? 1),
              minimumPurchaseAmount: 0,
              startsAt: new Date().toISOString(),
              endsAt: new Date().toISOString(),
            },
          ]
        : [];

    return res.status(200).json({
      campaignCount: campaign.length,
      totalAwardedPoints: campaign.reduce((sum, row) => sum + row.awardedPoints, 0),
      campaigns: campaign,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reach campaign service.";
    return res.status(503).json({ error: { message: `Campaign service unavailable: ${message}` } });
  }
}
