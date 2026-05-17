import type { NextApiRequest, NextApiResponse } from "next";

import { fetchServiceJson, tableMissing } from "../../server/api-fallback";
import { createMemberServerSupabaseClient } from "../../server/supabase-admin";

function mapShareEvent(row: any, member?: any) {
  const fullName = `${String(member?.first_name ?? "").trim()} ${String(member?.last_name ?? "").trim()}`.trim();
  return {
    id: String(row.id ?? ""),
    memberId: String(member?.member_number ?? member?.member_id ?? row.member_id ?? ""),
    memberName: fullName || String(member?.member_number ?? row.member_id ?? "Member"),
    tier: String(row.tier_at_share ?? member?.tier ?? "Bronze"),
    channel: String(row.channel ?? "facebook"),
    achievement: String(row.achievement ?? "Shared achievement"),
    referralCode: String(row.referral_code ?? ""),
    conversions: Math.max(0, Number(row.conversion_count ?? 0)),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

async function loadFromMemberDb() {
  const supabase = createMemberServerSupabaseClient();
  const { data, error } = await supabase
    .from("social_share_events")
    .select("id,member_id,referral_id,referral_code,channel,achievement,tier_at_share,badge_label,share_text,destination_url,conversion_count,last_converted_at,created_at")
    .order("created_at", { ascending: false });
  if (error) {
    if (tableMissing(error, "social_share_events")) return { ok: true, events: [] };
    throw error;
  }

  const rows = data || [];
  const memberIds = [...new Set(rows.map((row: any) => Number(row.member_id)).filter(Number.isFinite))];
  const memberMap = new Map<string, any>();
  if (memberIds.length > 0) {
    const members = await supabase.from("loyalty_members").select("id,member_id,member_number,first_name,last_name,tier").in("id", memberIds);
    if (!members.error) {
      for (const member of members.data || []) memberMap.set(String(member.id), member);
    }
  }

  return { ok: true, events: rows.map((row: any) => mapShareEvent(row, memberMap.get(String(row.member_id)))) };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!["GET", "POST"].includes(String(req.method))) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    let payload;
    try {
      payload = await fetchServiceJson(req, "MEMBER_SERVICE_URL", "http://127.0.0.1:4003", "/social-share-events");
    } catch {
      payload = req.method === "GET" ? await loadFromMemberDb() : { ok: true, event: null };
    }
    return res.status(200).json(payload);
  } catch {
    return res.status(200).json(req.method === "GET" ? { ok: true, events: [] } : { ok: true, event: null });
  }
}
