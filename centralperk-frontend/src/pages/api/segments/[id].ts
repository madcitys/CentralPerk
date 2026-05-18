import type { NextApiRequest, NextApiResponse } from "next";

import { proxyToService } from "../../../server/service-proxy";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) return res.status(400).json({ ok: false, error: { message: "Segment ID is required." } });

  return proxyToService(req, res, {
    baseUrlEnv: "SEGMENT_SERVICE_URL",
    fallbackBaseUrl: "http://localhost:4004",
    targetPath: `/segments/${encodeURIComponent(id)}`,
    methods: ["PATCH", "DELETE"] as const,
    adminWrite: true,
  });
}
