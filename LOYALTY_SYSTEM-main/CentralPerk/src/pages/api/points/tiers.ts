import type { NextApiRequest, NextApiResponse } from "next";

import { normalizeTierRules } from "../../../app/lib/loyalty-engine";
import { createServerSupabaseClient } from "../../../server/supabase-admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: { message: "Method not allowed." } });
  }

  try {
    const supabase = createServerSupabaseClient();
    const result = await supabase
      .from("points_tiers")
      .select("tier_label,min_points,is_active")
      .eq("is_active", true)
      .order("min_points", { ascending: false });

    if (result.error) {
      throw result.error;
    }

    return res.status(200).json({
      ok: true,
      tiers: normalizeTierRules(result.data || []),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load point tiers.";
    return res.status(500).json({ error: { message } });
  }
}
