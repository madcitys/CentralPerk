import type { NextApiRequest, NextApiResponse } from "next";

import { proxyToService } from "../../../server/service-proxy";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return proxyToService(req, res, {
    baseUrlEnv: "POINTS_SERVICE_URL",
    fallbackBaseUrl: "http://127.0.0.1:4001",
    targetPath: "/points/redeem",
    methods: ["POST"] as const,
  });
}
