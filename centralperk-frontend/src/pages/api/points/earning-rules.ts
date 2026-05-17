import type { NextApiRequest, NextApiResponse } from "next";

import { fetchServiceJson } from "../../../server/api-fallback";
import { createPointsServerSupabaseClient } from "../../../server/supabase-admin";

const DEFAULT_EARNING_RULES = [
  { tier_label: "Bronze", peso_per_point: 10, multiplier: 1, is_active: true },
  { tier_label: "Silver", peso_per_point: 10, multiplier: 1.25, is_active: true },
  { tier_label: "Gold", peso_per_point: 10, multiplier: 1.5, is_active: true },
];

async function loadFromPointsDb() {
  const supabase = createPointsServerSupabaseClient();
  const { data, error } = await supabase
    .from("earning_rules")
    .select("tier_label,peso_per_point,multiplier,is_active,effective_at")
    .eq("is_active", true)
    .order("effective_at", { ascending: false });
  if (error) throw error;
  return { ok: true, earningRules: data?.length ? data : DEFAULT_EARNING_RULES };
}

async function saveToPointsDb(req: NextApiRequest) {
  const rules = Array.isArray(req.body?.rules) ? req.body.rules : [];
  const supabase = createPointsServerSupabaseClient();
  for (const rule of rules) {
    const tier = String(rule.tier_label || "").trim();
    if (!tier) continue;
    await supabase.from("earning_rules").update({ is_active: false }).eq("tier_label", tier).eq("is_active", true);
    const { error } = await supabase.from("earning_rules").insert({
      tier_label: tier,
      peso_per_point: Math.max(0.01, Number(rule.peso_per_point) || 10),
      multiplier: Math.max(0.01, Number(rule.multiplier) || 1),
      is_active: rule.is_active ?? true,
      effective_at: new Date().toISOString(),
    });
    if (error) throw error;
  }
  return { ok: true };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!["GET", "PUT"].includes(String(req.method))) {
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    let payload;
    try {
      payload = await fetchServiceJson(req, "POINTS_SERVICE_URL", "http://127.0.0.1:4001", "/points/earning-rules");
    } catch {
      payload = req.method === "PUT" ? await saveToPointsDb(req) : await loadFromPointsDb();
    }
    return res.status(200).json(payload);
  } catch {
    return res.status(200).json({ ok: true, earningRules: DEFAULT_EARNING_RULES });
  }
}
