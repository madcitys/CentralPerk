import type { NextApiRequest, NextApiResponse } from "next";

import {
  fetchMemberEngagementSettings,
  saveMemberEngagementSettings,
} from "../../../../server/engagement-data";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "PATCH") {
    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  const memberId = String(req.query.memberId || "").trim();
  if (!memberId) {
    return res.status(400).json({ ok: false, error: { message: "Missing member id." } });
  }

  try {
    if (req.method === "PATCH") {
      const settings = await saveMemberEngagementSettings(memberId, req.body ?? {});
      return res.status(200).json({ ok: true, settings });
    }

    const settings = await fetchMemberEngagementSettings(memberId);
    return res.status(200).json({ ok: true, settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load engagement settings.";
    return res.status(500).json({ ok: false, error: { message } });
  }
}
