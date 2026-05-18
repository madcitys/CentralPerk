import type { NextApiRequest, NextApiResponse } from "next";

import { proxyToGateway } from "../../../../../server/service-proxy";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const challengeId = String(req.query.id || "").trim();
  return proxyToGateway(req, res, {
    targetPath: `/engagement/challenges/${encodeURIComponent(challengeId)}/leaderboard`,
    methods: ["GET"] as const,
  });
}
