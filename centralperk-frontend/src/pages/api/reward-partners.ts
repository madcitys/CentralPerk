import type { NextApiRequest, NextApiResponse } from "next";

import { fetchServiceJson, tableMissing } from "../../server/api-fallback";
import { createRewardServerSupabaseClient } from "../../server/supabase-admin";

async function loadFromRewardDb() {
  const supabase = createRewardServerSupabaseClient();
  const { data, error } = await supabase.from("reward_partners").select("*").order("partner_name", { ascending: true });
  if (error) {
    if (tableMissing(error, "reward_partners")) return { ok: true, partners: [] };
    throw error;
  }
  return { ok: true, partners: data || [] };
}

async function saveToRewardDb(req: NextApiRequest) {
  const body = req.body || {};
  const supabase = createRewardServerSupabaseClient();
  const payload = {
    partner_code: String(body.partnerCode ?? "").trim().toUpperCase(),
    partner_name: String(body.partnerName ?? "Partner").trim(),
    description: body.description ?? null,
    logo_url: body.logoUrl ?? null,
    conversion_rate: Math.max(0.01, Number(body.conversionRate ?? 1)),
    is_active: body.isActive ?? true,
  };
  const query = body.id
    ? supabase.from("reward_partners").update(payload).eq("id", body.id).select("*").single()
    : supabase.from("reward_partners").insert(payload).select("*").single();
  const { data, error } = await query;
  if (error) {
    if (tableMissing(error, "reward_partners")) return { ok: true, partner: null };
    throw error;
  }
  return { ok: true, partner: data };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!["GET", "POST"].includes(String(req.method))) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    let payload;
    try {
      payload = await fetchServiceJson(req, "REWARD_SERVICE_URL", "http://127.0.0.1:4006", "/reward-partners");
    } catch {
      payload = req.method === "POST" ? await saveToRewardDb(req) : await loadFromRewardDb();
    }
    return res.status(200).json(payload);
  } catch {
    return res.status(200).json(req.method === "POST" ? { ok: true, partner: null } : { ok: true, partners: [] });
  }
}
