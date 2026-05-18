import type { NextApiRequest, NextApiResponse } from "next";

import { fetchChallengeDefinitions } from "../../../../server/engagement-data";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    const challenges = await fetchChallengeDefinitions();
    return res.status(200).json({ ok: true, challenges });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load challenges.";
    return res.status(500).json({ ok: false, error: { message } });
  }
}
