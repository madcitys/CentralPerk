import type { NextApiRequest, NextApiResponse } from "next";

import { fetchServiceJson, tableMissing } from "../../../server/api-fallback";
import { createCampaignServerSupabaseClient } from "../../../server/supabase-admin";

function mapCampaign(row: Record<string, any>) {
  return {
    id: String(row.id ?? ""),
    campaignCode: String(row.campaign_code ?? ""),
    campaignName: String(row.campaign_name ?? "Campaign"),
    description: String(row.description ?? ""),
    campaignType: String(row.campaign_type ?? "bonus_points"),
    status: String(row.status ?? "scheduled"),
    multiplier: Number(row.multiplier ?? 1),
    minimumPurchaseAmount: Number(row.minimum_purchase_amount ?? 0),
    bonusPoints: Number(row.bonus_points ?? 0),
    productScope: Array.isArray(row.product_scope) ? row.product_scope.map(String) : [],
    eligibleTiers: Array.isArray(row.eligible_tiers) ? row.eligible_tiers.map(String) : [],
    rewardId: row.reward_id === null || row.reward_id === undefined ? null : String(row.reward_id),
    rewardName: row.rewards_catalog?.name ? String(row.rewards_catalog.name) : null,
    rewardPointsCost:
      row.rewards_catalog?.points_cost === null || row.rewards_catalog?.points_cost === undefined
        ? null
        : Number(row.rewards_catalog.points_cost),
    rewardImageUrl: row.rewards_catalog?.image_url ? String(row.rewards_catalog.image_url) : null,
    flashSaleQuantityLimit:
      row.flash_sale_quantity_limit === null || row.flash_sale_quantity_limit === undefined
        ? null
        : Number(row.flash_sale_quantity_limit),
    flashSaleClaimedCount: Number(row.flash_sale_claimed_count ?? 0),
    startsAt: String(row.starts_at ?? new Date().toISOString()),
    endsAt: String(row.ends_at ?? new Date().toISOString()),
    countdownLabel: row.countdown_label ? String(row.countdown_label) : null,
    bannerTitle: row.banner_title ? String(row.banner_title) : null,
    bannerMessage: row.banner_message ? String(row.banner_message) : null,
    bannerColor: String(row.banner_color ?? "#1A2B47"),
    pushNotificationEnabled: Boolean(row.push_notification_enabled ?? false),
    budgetUtilizationPercent:
      Number(row.budget_limit ?? 0) > 0 ? Math.round((Number(row.budget_spent ?? 0) / Number(row.budget_limit)) * 100) : 0,
    trackedTransactions: 0,
    pointsAwarded: 0,
    notificationsSent: 0,
  };
}

async function loadFromCampaignDb() {
  const now = new Date().toISOString();
  const supabase = createCampaignServerSupabaseClient();
  const { data, error } = await supabase
    .from("promotion_campaigns")
    .select("*, rewards_catalog(id,reward_id,name,points_cost,image_url)")
    .eq("status", "active")
    .lte("starts_at", now)
    .gte("ends_at", now)
    .order("starts_at", { ascending: false });

  if (error) {
    if (tableMissing(error, "promotion_campaigns")) return { ok: true, campaigns: [] };
    throw error;
  }

  return { ok: true, campaigns: (data || []).map((row) => mapCampaign(row as Record<string, any>)) };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    const payload = await fetchServiceJson(req, "CAMPAIGN_SERVICE_URL", "http://127.0.0.1:4002", "/campaigns/active").catch(() =>
      loadFromCampaignDb(),
    );
    return res.status(200).json(payload);
  } catch {
    return res.status(200).json({ ok: true, campaigns: [] });
  }
}
