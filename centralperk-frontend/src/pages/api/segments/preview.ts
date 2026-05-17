import type { NextApiRequest, NextApiResponse } from "next";

import { fetchServiceJson } from "../../../server/api-fallback";
import { createMemberServerSupabaseClient, createSegmentServerSupabaseClient } from "../../../server/supabase-admin";

type AnyRecord = Record<string, any>;

function toMemberPreview(row: AnyRecord) {
  const firstName = String(row.first_name ?? "").trim();
  const lastName = String(row.last_name ?? "").trim();
  const memberNumber = String(row.member_number ?? row.member_id ?? row.id ?? "");

  return {
    id: String(row.id ?? row.member_id ?? ""),
    memberNumber,
    fullName: `${firstName} ${lastName}`.trim() || memberNumber || "Member",
    email: String(row.email ?? ""),
    tier: String(row.tier ?? "Bronze"),
    pointsBalance: Math.max(0, Math.floor(Number(row.points_balance ?? 0))),
    lastActivityAt: row.last_activity_at ? String(row.last_activity_at) : null,
  };
}

function matchesCondition(member: ReturnType<typeof toMemberPreview>, condition: AnyRecord) {
  const field = String(condition.field || "").toLowerCase();
  const operator = String(condition.operator || "").toLowerCase();
  const value = String(condition.value || "").trim();

  if (field === "tier") {
    const tier = member.tier.toLowerCase();
    const expected = value.toLowerCase();
    return operator.includes("not") ? tier !== expected : tier === expected;
  }

  if (field === "points balance") {
    const expected = Number(value);
    if (!Number.isFinite(expected)) return true;
    if (operator.includes("greater") || operator.includes(">")) return member.pointsBalance > expected;
    if (operator.includes("less") || operator.includes("<")) return member.pointsBalance < expected;
    return member.pointsBalance === expected;
  }

  if (field === "last activity") {
    if (!member.lastActivityAt) return false;
    const days = Number(value);
    if (!Number.isFinite(days)) return true;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const activityTime = new Date(member.lastActivityAt).getTime();
    if (!Number.isFinite(activityTime)) return false;
    if (operator.includes("within") || operator.includes("less")) return activityTime >= cutoff;
    if (operator.includes("before") || operator.includes("older") || operator.includes("greater")) return activityTime < cutoff;
  }

  return true;
}

function filterMembers(members: ReturnType<typeof toMemberPreview>[], body: AnyRecord) {
  const conditions = Array.isArray(body.conditions) ? body.conditions : [];
  if (conditions.length === 0) return members;
  const useOr = String(body.logicMode || "AND").toUpperCase() === "OR";
  return members.filter((member) => {
    const results = conditions.map((condition) => matchesCondition(member, condition));
    return useOr ? results.some(Boolean) : results.every(Boolean);
  });
}

async function loadMembersFromSupabase() {
  const clients = [
    () => createSegmentServerSupabaseClient(),
    () => createMemberServerSupabaseClient(),
  ];

  for (const createClient of clients) {
    try {
      const supabase = createClient();
      let result: any = await supabase
        .from("loyalty_members")
        .select("id,member_id,member_number,first_name,last_name,email,tier,points_balance,last_activity_at")
        .limit(5000);

      if (result.error) {
        result = await supabase
          .from("loyalty_members")
          .select("id,member_id,member_number,first_name,last_name,email,tier,points_balance")
          .limit(5000);
      }

      if (!result.error) return ((result.data || []) as AnyRecord[]).map(toMemberPreview);
    } catch {
      // Try the next service-owned database.
    }
  }

  return [];
}

async function previewFromSupabase(req: NextApiRequest) {
  const body = (req.body || {}) as AnyRecord;
  const members = filterMembers(await loadMembersFromSupabase(), body);
  return { ok: true, preview: { count: members.length, members } };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    const payload = await fetchServiceJson(req, "SEGMENT_SERVICE_URL", "http://127.0.0.1:4004", "/segments/preview").catch(() =>
      previewFromSupabase(req),
    );
    return res.status(200).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to preview segment.";
    return res.status(200).json({ ok: true, preview: { count: 0, members: [] }, warning: message });
  }
}
