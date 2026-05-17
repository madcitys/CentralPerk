import type { NextApiRequest, NextApiResponse } from "next";

import { fetchServiceJson } from "../../../server/api-fallback";
import { createMemberServerSupabaseClient } from "../../../server/supabase-admin";

const MEMBER_COLUMNS =
  "id,member_id,member_number,first_name,last_name,email,phone,birthdate,points_balance,tier,enrollment_date,address,profile_photo_url";

function mapMember(row: Record<string, any>) {
  return {
    ...row,
    id: Number(row.id ?? row.member_id),
    memberId: Number(row.member_id ?? row.id),
    memberNumber: String(row.member_number ?? row.member_id ?? row.id ?? ""),
    member_number: String(row.member_number ?? row.member_id ?? row.id ?? ""),
    email: row.email ? String(row.email) : null,
    firstName: row.first_name ? String(row.first_name) : null,
    lastName: row.last_name ? String(row.last_name) : null,
    first_name: row.first_name ? String(row.first_name) : null,
    last_name: row.last_name ? String(row.last_name) : null,
    pointsBalance: Math.max(0, Math.floor(Number(row.points_balance ?? 0))),
    points_balance: Math.max(0, Math.floor(Number(row.points_balance ?? 0))),
    tier: String(row.tier || "Bronze"),
  };
}

function normalizeText(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function resolveFromMemberDb(req: NextApiRequest) {
  const identifier = String(req.query.identifier || "").trim();
  const fallbackEmail = String(req.query.fallbackEmail || "").trim();
  const name = normalizeText(req.query.name);
  const supabase = createMemberServerSupabaseClient();

  const candidates: string[] = [];
  if (identifier) candidates.push(identifier);
  if (fallbackEmail) candidates.push(fallbackEmail);

  for (const candidate of candidates) {
    let query = supabase.from("loyalty_members").select(MEMBER_COLUMNS);
    const escaped = candidate.replaceAll(",", "\\,");
    if (Number.isFinite(Number(candidate))) {
      query = query.or(`member_number.eq.${escaped},member_id.eq.${escaped},id.eq.${Number(candidate)},email.ilike.${escaped}`);
    } else {
      query = query.or(`member_number.eq.${escaped},email.ilike.${escaped}`);
    }
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw error;
    if (data) return { ok: true, member: mapMember(data as Record<string, any>) };
  }

  if (name && name !== "member") {
    const { data, error } = await supabase
      .from("loyalty_members")
      .select(MEMBER_COLUMNS)
      .order("enrollment_date", { ascending: false })
      .limit(100);
    if (error) throw error;

    const matched = (data || []).find((row: any) => {
      const fullName = normalizeText(`${row.first_name || ""} ${row.last_name || ""}`);
      return fullName === name || fullName.includes(name) || name.includes(fullName);
    });
    if (matched) return { ok: true, member: mapMember(matched as Record<string, any>) };
  }

  return { ok: false, error: { message: "member_not_found" } };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    let payload: any = null;
    if (req.query.identifier) {
      payload = await fetchServiceJson(req, "MEMBER_SERVICE_URL", "http://127.0.0.1:4003", "/members/resolve").catch(() => null);
    }
    if (!payload?.ok) payload = await resolveFromMemberDb(req);
    if (!payload?.ok) return res.status(404).json(payload);
    return res.status(200).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to resolve member.";
    return res.status(500).json({ ok: false, error: { message } });
  }
}
