import type { NextApiRequest, NextApiResponse } from "next";

import { proxyToService } from "../../../../server/service-proxy";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = String(req.query.id || "").trim();
  return proxyToService(req, res, {
    baseUrlEnv: "MEMBER_SERVICE_URL",
    fallbackBaseUrl: "http://127.0.0.1:4003",
    targetPath: `/members/${encodeURIComponent(id)}/login-activity`,
    methods: ["POST"] as const,
  });
}
