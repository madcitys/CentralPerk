import type { NextApiRequest, NextApiResponse } from "next";

import { proxyToGateway } from "../../../../../server/service-proxy";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const surveyId = String(req.query.id || "").trim();
  return proxyToGateway(req, res, {
    targetPath: `/engagement/surveys/${encodeURIComponent(surveyId)}/responses`,
    methods: ["POST", "DELETE"] as const,
  });
}
