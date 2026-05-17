import type { NextApiRequest, NextApiResponse } from "next";

import { fetchServiceJson, tableMissing } from "../../server/api-fallback";
import { createCampaignServerSupabaseClient } from "../../server/supabase-admin";

const SELECT_COLUMNS = "id,campaign_name,segment,offer_type,offer_value,status,targeted_members,responses,reengaged_members,estimated_revenue,offer_cost,launch_date";

async function loadFromCampaignDb() {
  const supabase = createCampaignServerSupabaseClient();
  const { data, error } = await supabase.from("winback_campaigns").select(SELECT_COLUMNS).order("launch_date", { ascending: false });
  if (error) {
    if (tableMissing(error, "winback_campaigns")) return { ok: true, campaigns: [] };
    throw error;
  }
  return { ok: true, campaigns: data || [] };
}

async function saveToCampaignDb(req: NextApiRequest) {
  const body = req.body || {};
  const supabase = createCampaignServerSupabaseClient();
  const { data, error } = await supabase
    .from("winback_campaigns")
    .insert({
      campaign_code: `WB-${Date.now()}`,
      campaign_name: body.name,
      segment: body.segment,
      offer_type: body.offerType,
      offer_value: body.offerValue,
      status: body.status ?? "scheduled",
      targeted_members: body.targetedMembers ?? 0,
      responses: body.responses ?? 0,
      reengaged_members: body.reengagedMembers ?? 0,
      estimated_revenue: body.estimatedRevenue ?? 0,
      offer_cost: body.offerCost ?? 0,
      launch_date: new Date().toISOString(),
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) {
    if (tableMissing(error, "winback_campaigns")) return { ok: true, campaign: null };
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
      payload = await fetchServiceJson(req, "CAMPAIGN_SERVICE_URL", "http://127.0.0.1:4002", "/winback-campaigns");
    } catch {
      payload = req.method === "POST" ? await saveToCampaignDb(req) : await loadFromCampaignDb();
    }
    return res.status(200).json(payload);
  } catch {
    return res.status(200).json(req.method === "POST" ? { ok: true, campaign: null } : { ok: true, campaigns: [] });
  }
}
