import type { NextApiRequest, NextApiResponse } from "next";

import { createMemberServerSupabaseClient } from "../../../server/supabase-admin";

type AnyRecord = Record<string, any>;

function numericValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    const supabase = createMemberServerSupabaseClient();
    const { data, error } = await supabase.from("loyalty_members").select("*").order("enrollment_date", { ascending: false });
    if (error) throw error;

    const members = ((data || []) as AnyRecord[]).map((row) => ({
      ...row,
      id: row.id ?? row.member_id ?? null,
      member_id: row.member_id ?? row.id ?? null,
      member_number: String(row.member_number ?? row.member_id ?? row.id ?? ""),
      points_balance: numericValue(row.points_balance),
      tier: String(row.tier || "Bronze"),
    }));

    return res.status(200).json({ ok: true, members });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load members.";
    return res.status(500).json({ ok: false, error: { message } });
  }
}
