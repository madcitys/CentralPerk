import type { NextApiRequest, NextApiResponse } from "next";

import { normalizeRewardDescription, normalizeRewardDisplayName, normalizeRewardImageUrl } from "../../../app/lib/reward-display";
import { createRewardServerSupabaseClient } from "../../../server/supabase-admin";
import { serviceBaseUrl } from "../../../server/service-proxy";

function mapRewardRow(row: Record<string, any>) {
  const partner = row.reward_partners || null;
  const rawName = String(row.name ?? "Reward");
  const rawDescription = String(row.description ?? "");
  return {
    ...row,
    name: normalizeRewardDisplayName(rawName),
    description: normalizeRewardDescription(rawName, rawDescription),
    image_url: normalizeRewardImageUrl(rawName, row.image_url ? String(row.image_url) : undefined) ?? null,
    partner_code: partner?.partner_code ?? row.partner_code ?? null,
    partner_name: partner?.partner_name ?? row.partner_name ?? null,
    partner_logo_url: partner?.logo_url ?? row.partner_logo_url ?? null,
    partner_conversion_rate: partner?.conversion_rate ?? row.partner_conversion_rate ?? null,
  };
}

async function loadFromRewardService() {
  const baseUrl = serviceBaseUrl("REWARD_SERVICE_URL", "http://127.0.0.1:4006");
  const response = await fetch(`${baseUrl}/rewards`, {
    headers: { accept: "application/json" },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : typeof payload?.error?.message === "string"
          ? payload.error.message
          : `Reward service failed (${response.status}).`;
    throw new Error(message);
  }

  return Array.isArray(payload?.rewards) ? payload.rewards.map((row: Record<string, any>) => mapRewardRow(row)) : [];
}

async function loadFromRewardSupabase() {
  const supabase = createRewardServerSupabaseClient();
  let result = await supabase
    .from("rewards_catalog")
    .select("*, reward_partners(id,partner_code,partner_name,logo_url,conversion_rate,is_active)")
    .order("points_cost", { ascending: true })
    .limit(500);

  if (result.error) {
    result = await supabase.from("rewards_catalog").select("*").order("points_cost", { ascending: true }).limit(500);
  }

  if (result.error) throw result.error;
  return (result.data || []).map(mapRewardRow);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    let rewards = await loadFromRewardService().catch(() => loadFromRewardSupabase());
    if (rewards.length === 0) {
      const fallbackRewards = await loadFromRewardSupabase().catch(() => []);
      if (fallbackRewards.length > 0) rewards = fallbackRewards;
    }
    return res.status(200).json({ ok: true, rewards });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load rewards.";
    return res.status(500).json({ ok: false, error: { message } });
  }
}
