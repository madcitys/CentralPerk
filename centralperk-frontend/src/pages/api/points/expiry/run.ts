import type { NextApiRequest, NextApiResponse } from "next";

import { fetchServiceJson } from "../../../../server/api-fallback";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    const payload = await fetchServiceJson(req, "POINTS_SERVICE_URL", "http://127.0.0.1:4001", "/points/expiry/run").catch(() => ({
      ok: true,
      result: { processed: 0, expired: 0, unavailable: true },
    }));
    return res.status(200).json(payload);
  } catch {
    return res.status(200).json({ ok: true, result: { processed: 0, expired: 0, unavailable: true } });
  }
}
