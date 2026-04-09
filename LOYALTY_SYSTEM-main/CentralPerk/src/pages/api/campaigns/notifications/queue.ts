import type { NextApiRequest, NextApiResponse } from "next";

import { queueCampaignNotifications } from "../../../../app/lib/promotions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: { message: "Method not allowed." } });
  }

  try {
    const campaignId = typeof req.body?.campaignId === "string" ? req.body.campaignId.trim() : "";
    if (!campaignId) return res.status(400).json({ error: { message: "campaignId is required." } });

    const queuedCount = await queueCampaignNotifications(campaignId);
    return res.status(200).json({ campaignId, queuedCount });
  } catch (error) {
    const statusCode = Number((error as { statusCode?: number }).statusCode || 500);
    const message = error instanceof Error ? error.message : "Unable to queue campaign notifications.";
    return res.status(statusCode).json({ error: { message } });
  }
}
