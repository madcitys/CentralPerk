import type { NextApiRequest, NextApiResponse } from "next";

import { createMemberServerSupabaseClient } from "../../../server/supabase-admin";

type AnyRecord = Record<string, any>;

function isMissingRelationError(error: unknown, table: string) {
  const message = String(
    (error as { message?: unknown; details?: unknown; hint?: unknown })?.message ??
      (error as { details?: unknown })?.details ??
      (error as { hint?: unknown })?.hint ??
      "",
  ).toLowerCase();

  return (
    message.includes(`relation "${table.toLowerCase()}" does not exist`) ||
    message.includes(`relation "public.${table.toLowerCase()}" does not exist`) ||
    message.includes(`could not find the table 'public.${table.toLowerCase()}' in the schema cache`) ||
    message.includes(`could not find the table "${table.toLowerCase()}" in the schema cache`) ||
    message.includes(`could not find the table '${table.toLowerCase()}' in the schema cache`) ||
    (message.includes(table.toLowerCase()) && message.includes("schema cache")) ||
    (message.includes(table.toLowerCase()) && message.includes("does not exist"))
  );
}

async function safeQuery<T>(query: PromiseLike<{ data: T | null; error: any }>, table: string, fallback: T) {
  const result = await query;
  if (result.error) {
    console.warn(`[admin/datasets] falling back for ${table}:`, result.error);
    return fallback;
  }
  return (result.data ?? fallback) as T;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    const supabase = createMemberServerSupabaseClient();
    const [
      memberSegments,
      tierHistory,
      pointsLots,
      rewardsCatalog,
      loginActivity,
      reengagementActions,
      redemptionSettings,
    ] = await Promise.all([
      safeQuery(supabase.rpc("loyalty_member_segments"), "loyalty_member_segments", [] as AnyRecord[]),
      safeQuery(
        supabase.from("tier_history").select("old_tier,new_tier,changed_at").order("changed_at", { ascending: false }).limit(500),
        "tier_history",
        [] as AnyRecord[],
      ),
      safeQuery(
        supabase.from("points_lots").select("*").order("expiry_date", { ascending: true }),
        "points_lots",
        [] as AnyRecord[],
      ),
      safeQuery(
        supabase.from("rewards_catalog").select("*").order("points_cost", { ascending: true }),
        "rewards_catalog",
        [] as AnyRecord[],
      ),
      safeQuery(
        supabase.from("member_login_activity").select("*").order("login_at", { ascending: false }).limit(5000),
        "member_login_activity",
        [] as AnyRecord[],
      ),
      safeQuery(
        supabase.from("member_reengagement_actions").select("*").order("created_at", { ascending: false }).limit(5000),
        "member_reengagement_actions",
        [] as AnyRecord[],
      ),
      safeQuery(
        supabase
          .from("redemption_settings")
          .select("redemption_value_per_point")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        "redemption_settings",
        null as AnyRecord | null,
      ),
    ]);

    return res.status(200).json({
      ok: true,
      memberSegments,
      tierHistory,
      pointsLots,
      rewardsCatalog,
      loginActivity,
      reengagementActions,
      redemptionSettings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load admin datasets.";
    return res.status(500).json({ ok: false, error: { message } });
  }
}
