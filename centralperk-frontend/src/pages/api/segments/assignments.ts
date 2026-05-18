import type { NextApiRequest, NextApiResponse } from "next";

import { proxyToService } from "../../../server/service-proxy";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return proxyToService(req, res, {
    baseUrlEnv: "SEGMENT_SERVICE_URL",
    fallbackBaseUrl: "http://localhost:4004",
    targetPath: "/segments/assignments",
    methods: ["GET", "POST", "DELETE"] as const,
    adminWrite: true,
  });
}
