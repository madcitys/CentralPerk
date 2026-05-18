import type { NextApiRequest, NextApiResponse } from "next";

import { proxyToService } from "../../../server/service-proxy";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return proxyToService(req, res, {
    baseUrlEnv: "SCM_SEGMENT_SERVICE_URL",
    fallbackBaseUrl: "http://127.0.0.1:3013",
    targetPath: "/segments/preview",
    methods: ["POST"] as const,
  });
}
