import type { NextApiRequest, NextApiResponse } from "next";

import { claimFlashSaleCampaign } from "../../../../app/lib/promotions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: { message: "Method not allowed." } });
  }

  try {
    const campaignReference = typeof req.body?.campaignId === "string" ? req.body.campaignId.trim() : "";
    if (!campaignReference) return res.status(400).json({ error: { message: "campaignId is required." } });

    const result = await claimFlashSaleCampaign(campaignReference);
    return res.status(200).json(result);
  } catch (error) {
    const message = String(
      (error as { message?: unknown; details?: unknown; hint?: unknown })?.message ??
        (error as { details?: unknown })?.details ??
        (error as { hint?: unknown })?.hint ??
        "Unable to claim flash sale."
    );
    const normalizedMessage = message.toLowerCase();
    const statusCode = Number(
      (error as { statusCode?: number }).statusCode ||
        (normalizedMessage.includes("not found")
          ? 404
          : normalizedMessage.includes("sold out") || normalizedMessage.includes("expired")
            ? 409
            : 500)
    );
    return res.status(statusCode).json({ error: { message } });
  }
}
