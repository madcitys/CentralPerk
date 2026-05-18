import type { NextApiRequest, NextApiResponse } from "next";

import { proxyToGateway } from "../../../../server/service-proxy";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const memberId = String(req.query.memberId || "").trim();
  return proxyToGateway(req, res, {
    targetPath: `/engagement/settings/${encodeURIComponent(memberId)}`,
    methods: ["GET", "PATCH"] as const,
  });
}
