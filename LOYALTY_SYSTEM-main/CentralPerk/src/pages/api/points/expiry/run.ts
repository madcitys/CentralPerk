import type { NextApiRequest, NextApiResponse } from "next";

import { processAllMemberExpiredPointsDirect } from "../../../../app/lib/loyalty-supabase";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: { message: "Method not allowed." } });
  }

  try {
    const result = await processAllMemberExpiredPointsDirect();
    return res.status(200).json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run point expiry.";
    return res.status(500).json({ error: { message } });
  }
}
