import type { NextApiRequest, NextApiResponse } from "next";

import { loadCampaignPerformance } from "../../../app/lib/promotions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: { message: "Method not allowed." } });
  }

  try {
    const data = await loadCampaignPerformance();
    return res.status(200).json({ items: data, count: data.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load campaign performance.";
    return res.status(500).json({ error: { message } });
  }
}
