import type { NextApiRequest, NextApiResponse } from "next";

import { serviceBaseUrl } from "../../../server/service-proxy";

async function fetchService(path: string, envName: string, fallbackBaseUrl: string) {
  const response = await fetch(`${serviceBaseUrl(envName, fallbackBaseUrl)}${path}`, {
    headers: { accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : typeof payload?.error?.message === "string"
          ? payload.error.message
          : `Service request failed (${response.status}).`;
    throw new Error(message);
  }
  return payload;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    const [segmentsPayload, rewardsPayload] = await Promise.all([
      fetchService("/segments/assignments", "SEGMENT_SERVICE_URL", "http://127.0.0.1:4004"),
      fetchService("/rewards", "REWARD_SERVICE_URL", "http://127.0.0.1:4006"),
    ]);

    return res.status(200).json({
      ok: true,
      memberSegments: segmentsPayload.assignments ?? [],
      tierHistory: [],
      pointsLots: [],
      rewardsCatalog: rewardsPayload.rewards ?? [],
      loginActivity: [],
      reengagementActions: [],
      redemptionSettings: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load admin datasets.";
    return res.status(503).json({ ok: false, error: { message } });
  }
}
