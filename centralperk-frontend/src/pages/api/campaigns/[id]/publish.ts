import type { NextApiRequest, NextApiResponse } from "next";

import { proxyToService } from "../../../../server/service-proxy";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = String(req.query.id || "").trim();
  if (!id) return res.status(400).json({ error: { message: "Campaign ID is required." } });

  return proxyToService(req, res, {
    baseUrlEnv: "CAMPAIGN_SERVICE_URL",
    fallbackBaseUrl: "http://127.0.0.1:4002",
    targetPath: `/campaigns/${encodeURIComponent(id)}/publish`,
    methods: ["PATCH"] as const,
    adminWrite: true,
  });
}
