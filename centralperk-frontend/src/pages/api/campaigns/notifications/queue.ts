import type { NextApiRequest, NextApiResponse } from "next";

import { proxyToService } from "../../../../server/service-proxy";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const campaignId = typeof req.body?.campaignId === "string" ? req.body.campaignId.trim() : "";
  if (!campaignId) return res.status(400).json({ error: { message: "campaignId is required." } });

  return proxyToService(req, res, {
    baseUrlEnv: "CAMPAIGN_SERVICE_URL",
    fallbackBaseUrl: "http://127.0.0.1:4002",
    targetPath: `/campaigns/${encodeURIComponent(campaignId)}/notify`,
    methods: ["POST"] as const,
    adminWrite: true,
  });
}
