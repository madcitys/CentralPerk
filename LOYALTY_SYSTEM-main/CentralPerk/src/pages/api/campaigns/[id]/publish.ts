import type { NextApiRequest, NextApiResponse } from "next";

import { proxyToGateway } from "../../../../server/service-proxy";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = String(req.query.id || "").trim();
  if (!id) return res.status(400).json({ error: { message: "Campaign ID is required." } });

  return proxyToGateway(req, res, {
    targetPath: `/campaigns/${encodeURIComponent(id)}/publish`,
    methods: ["PATCH"] as const,
    adminWrite: true,
  });
}
