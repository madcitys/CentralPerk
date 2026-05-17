import type { NextApiRequest, NextApiResponse } from "next";

import { fetchServiceJson, tableMissing } from "../../../server/api-fallback";
import { createCampaignServerSupabaseClient } from "../../../server/supabase-admin";

async function loadFromCampaignDb() {
  const supabase = createCampaignServerSupabaseClient();
  const { data, error } = await supabase.from("promotion_campaigns").select("*").order("starts_at", { ascending: false });
  if (error) {
    if (tableMissing(error, "promotion_campaigns")) return { ok: true, campaigns: [] };
    throw error;
  }
  return { ok: true, campaigns: data || [] };
}

async function saveToCampaignDb(req: NextApiRequest) {
  const body = req.body || {};
  const supabase = createCampaignServerSupabaseClient();
  const payload = {
    campaign_code: String(body.campaignCode ?? `CMP-${Date.now()}`).trim(),
    campaign_name: String(body.campaignName ?? "Campaign").trim(),
    description: body.description ?? null,
    campaign_type: body.campaignType ?? "bonus_points",
    status: body.status ?? "scheduled",
    multiplier: Number(body.multiplier ?? 1),
    minimum_purchase_amount: Number(body.minimumPurchaseAmount ?? 0),
    bonus_points: Number(body.bonusPoints ?? 0),
    product_scope: Array.isArray(body.productScope) ? body.productScope : [],
    eligible_tiers: Array.isArray(body.eligibleTiers) ? body.eligibleTiers : [],
    reward_id: body.rewardId || null,
    flash_sale_quantity_limit: body.flashSaleQuantityLimit ?? null,
    starts_at: body.startsAt ?? new Date().toISOString(),
    ends_at: body.endsAt ?? new Date(Date.now() + 86_400_000).toISOString(),
    countdown_label: body.countdownLabel ?? null,
    banner_title: body.bannerTitle ?? null,
    banner_message: body.bannerMessage ?? null,
    banner_color: body.bannerColor ?? "#1A2B47",
    push_notification_enabled: Boolean(body.pushNotificationEnabled ?? false),
  };
  const query = body.id
    ? supabase.from("promotion_campaigns").update(payload).eq("id", body.id).select("*").single()
    : supabase.from("promotion_campaigns").insert(payload).select("*").single();
  const { data, error } = await query;
  if (error) {
    if (tableMissing(error, "promotion_campaigns")) return { ok: true, campaign: null };
    throw error;
  }
  return { ok: true, campaign: data };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!["GET", "POST"].includes(String(req.method))) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    let payload;
    try {
      payload = await fetchServiceJson(req, "CAMPAIGN_SERVICE_URL", "http://127.0.0.1:4002", "/campaigns");
    } catch {
      payload = req.method === "POST" ? await saveToCampaignDb(req) : await loadFromCampaignDb();
    }
    return res.status(200).json(payload);
  } catch {
    return res.status(200).json(req.method === "POST" ? { ok: true, campaign: null } : { ok: true, campaigns: [] });
  }
}
