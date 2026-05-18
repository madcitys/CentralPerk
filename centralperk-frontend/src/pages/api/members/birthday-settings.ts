import type { NextApiRequest, NextApiResponse } from "next";

import { proxyToService } from "../../../server/service-proxy";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return proxyToService(req, res, {
    baseUrlEnv: "MEMBER_SERVICE_URL",
    fallbackBaseUrl: "http://127.0.0.1:4003",
    targetPath: "/birthday-settings",
    methods: ["GET", "PATCH"] as const,
  });
}
