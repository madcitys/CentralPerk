import type { NextApiRequest, NextApiResponse } from "next";

import { proxyToService } from "../../../server/service-proxy";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) return res.status(400).json({ ok: false, error: { message: "Campaign ID is required." } });

  return proxyToService(req, res, {
    baseUrlEnv: "NOTIFICATION_SERVICE_URL",
    fallbackBaseUrl: "http://localhost:4005",
    targetPath: `/notification-campaigns/${encodeURIComponent(id)}`,
    methods: ["PATCH"] as const,
    adminWrite: true,
  });
}
