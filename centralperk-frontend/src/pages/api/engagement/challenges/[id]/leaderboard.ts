import type { NextApiRequest, NextApiResponse } from "next";

import { fetchChallengeLeaderboard } from "../../../../../server/engagement-data";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  const challengeId = String(req.query.id || "").trim();
  if (!challengeId) {
    return res.status(400).json({ ok: false, error: { message: "Missing challenge id." } });
  }

  try {
    const leaderboard = await fetchChallengeLeaderboard(challengeId);
    return res.status(200).json({ ok: true, leaderboard });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load challenge leaderboard.";
    return res.status(500).json({ ok: false, error: { message } });
  }
}
