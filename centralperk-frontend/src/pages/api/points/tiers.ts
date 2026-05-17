import type { NextApiRequest, NextApiResponse } from "next";

import { fetchServiceJson } from "../../../server/api-fallback";
import { createPointsServerSupabaseClient } from "../../../server/supabase-admin";

const DEFAULT_TIERS = [
  { tier_label: "Bronze", min_points: 0, is_active: true },
  { tier_label: "Silver", min_points: 250, is_active: true },
  { tier_label: "Gold", min_points: 750, is_active: true },
];

async function loadFromPointsDb() {
  const supabase = createPointsServerSupabaseClient();
  const { data, error } = await supabase
    .from("points_tiers")
    .select("tier_label,min_points,is_active")
    .eq("is_active", true)
    .order("min_points", { ascending: true });
  if (error) throw error;
  return { ok: true, tiers: data?.length ? data : DEFAULT_TIERS };
}

async function saveToPointsDb(req: NextApiRequest) {
  const rules = Array.isArray(req.body?.rules) ? req.body.rules : [];
  const rows = rules.map((rule: any) => ({
    tier_label: String(rule.tier_label || "").trim(),
    min_points: Math.max(0, Math.floor(Number(rule.min_points) || 0)),
    is_active: rule.is_active ?? true,
  })).filter((rule: any) => rule.tier_label);

  if (rows.length === 0) return { ok: true, tiers: DEFAULT_TIERS };
  const supabase = createPointsServerSupabaseClient();
  const { error } = await supabase.from("points_tiers").upsert(rows, { onConflict: "tier_label" });
  if (error) throw error;
  return { ok: true, tiers: rows };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!["GET", "PUT"].includes(String(req.method))) {
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    let payload;
    try {
      payload = await fetchServiceJson(req, "POINTS_SERVICE_URL", "http://127.0.0.1:4001", "/points/tiers");
    } catch {
      payload = req.method === "PUT" ? await saveToPointsDb(req) : await loadFromPointsDb();
    }
    return res.status(200).json(payload);
  } catch {
    return res.status(200).json({ ok: true, tiers: DEFAULT_TIERS });
  }
}
