import type { NextApiRequest, NextApiResponse } from "next";

import { proxyToService } from "../../../../server/service-proxy";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) return res.status(400).json({ ok: false, error: { message: "Notification ID is required." } });

  return proxyToService(req, res, {
    baseUrlEnv: "NOTIFICATION_SERVICE_URL",
    fallbackBaseUrl: "http://127.0.0.1:4005",
    targetPath: `/notifications/${encodeURIComponent(id)}/read`,
    methods: ["PATCH"] as const,
  });
}
