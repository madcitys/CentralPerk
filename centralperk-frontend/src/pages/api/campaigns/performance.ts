import type { NextApiRequest, NextApiResponse } from "next";

import { fetchServiceJson } from "../../../server/api-fallback";
import { createCampaignServerSupabaseClient } from "../../../server/supabase-admin";

async function loadFromCampaignDb() {
  const supabase = createCampaignServerSupabaseClient();
  const { data, error } = await supabase.rpc("loyalty_campaign_performance");
  if (error) return { ok: true, performance: [] };
  return { ok: true, performance: data || [] };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    const payload = await fetchServiceJson(req, "CAMPAIGN_SERVICE_URL", "http://127.0.0.1:4002", "/campaigns/performance").catch(() =>
      loadFromCampaignDb(),
    );
    return res.status(200).json(payload);
  } catch {
    return res.status(200).json({ ok: true, performance: [] });
  }
}
