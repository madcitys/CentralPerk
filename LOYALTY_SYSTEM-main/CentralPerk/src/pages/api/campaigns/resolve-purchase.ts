import type { NextApiRequest, NextApiResponse } from "next";

import { supabase } from "../../../utils/supabase/client";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: { message: "Method not allowed." } });
  }

  try {
    const payload = req.body ?? {};
    const { data, error } = await supabase.rpc("loyalty_resolve_purchase_campaigns", {
      p_member_id: Number(payload.memberId || 0),
      p_purchase_amount: Number(payload.purchaseAmount || 0),
      p_base_points: Math.max(0, Math.floor(Number(payload.basePoints || 0))),
      p_member_tier: typeof payload.memberTier === "string" ? payload.memberTier.trim() : null,
      p_product_scope: typeof payload.productScope === "string" ? payload.productScope.trim() : null,
    });

    if (error) throw error;

    const campaigns = ((data || []) as Array<Record<string, unknown>>).map((row) => ({
      campaignId: String(row.campaign_id ?? ""),
      campaignName: String(row.campaign_name ?? ""),
      campaignType: String(row.campaign_type ?? "bonus_points"),
      awardedPoints: Number(row.awarded_points ?? 0),
      appliedMultiplier: Number(row.applied_multiplier ?? 1),
      minimumPurchaseAmount: Number(row.minimum_purchase_amount ?? 0),
      startsAt: new Date().toISOString(),
      endsAt: new Date().toISOString(),
    }));

    return res.status(200).json({
      campaignCount: campaigns.length,
      totalAwardedPoints: campaigns.reduce((sum, row) => sum + row.awardedPoints, 0),
      campaigns,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to resolve campaigns.";
    return res.status(500).json({ error: { message } });
  }
}
