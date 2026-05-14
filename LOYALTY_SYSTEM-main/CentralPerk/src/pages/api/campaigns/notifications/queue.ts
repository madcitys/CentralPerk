import type { NextApiRequest, NextApiResponse } from "next";

import { proxyToGateway } from "../../../../server/service-proxy";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const campaignId = typeof req.body?.campaignId === "string" ? req.body.campaignId.trim() : "";
  if (!campaignId) return res.status(400).json({ error: { message: "campaignId is required." } });

  return proxyToGateway(req, res, {
    targetPath: `/campaigns/${encodeURIComponent(campaignId)}/notify`,
    methods: ["POST"] as const,
    adminWrite: true,
  });
}
