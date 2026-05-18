import type { NextApiRequest, NextApiResponse } from "next";

import { proxyToGateway } from "../../../server/service-proxy";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return proxyToGateway(req, res, {
    targetPath: "/rewards/redeem",
    methods: ["POST"] as const,
  });
}
