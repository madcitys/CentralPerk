import type { NextApiRequest, NextApiResponse } from "next";

import { fetchServiceJson, tableMissing } from "../../server/api-fallback";
import { createNotificationServerSupabaseClient } from "../../server/supabase-admin";

const SELECT_COLUMNS =
  "id,campaign_name,trigger_event,segment,scheduled_for,status,audience_size,sent_count,delivered_count,opened_count,variant_a,variant_b,winning_variant";

async function loadFromNotificationDb() {
  const supabase = createNotificationServerSupabaseClient();
  const { data, error } = await supabase.from("notification_campaigns").select(SELECT_COLUMNS).order("scheduled_for", { ascending: false });
  if (error) {
    if (tableMissing(error, "notification_campaigns")) return { ok: true, campaigns: [] };
    throw error;
  }
  return { ok: true, campaigns: data || [] };
}

async function saveToNotificationDb(req: NextApiRequest) {
  const body = req.body || {};
  const supabase = createNotificationServerSupabaseClient();
  const { data, error } = await supabase
    .from("notification_campaigns")
    .insert({
      campaign_code: `NC-${Date.now()}`,
      campaign_name: body.name,
      trigger_event: body.trigger,
      segment: body.segment,
      scheduled_for: body.scheduledFor,
      audience_size: body.audienceSize ?? 0,
      variant_a: body.variantA ?? "",
      variant_b: body.variantB ?? "",
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) {
    if (tableMissing(error, "notification_campaigns")) return { ok: true, campaign: null };
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
      payload = await fetchServiceJson(req, "NOTIFICATION_SERVICE_URL", "http://127.0.0.1:4005", "/notification-campaigns");
    } catch {
      payload = req.method === "POST" ? await saveToNotificationDb(req) : await loadFromNotificationDb();
    }
    return res.status(200).json(payload);
  } catch {
    return res.status(200).json(req.method === "POST" ? { ok: true, campaign: null } : { ok: true, campaigns: [] });
  }
}
