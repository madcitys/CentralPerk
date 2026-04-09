import type { NextApiRequest, NextApiResponse } from "next";

import { awardMemberPoints } from "../../../app/lib/loyalty-supabase";
import { supabase } from "../../../utils/supabase/client";
import { createPointsApi } from "../../../server/api/points-core.mjs";

async function findMemberSnapshot(memberIdentifier: string, fallbackEmail?: string) {
  let query = supabase
    .from("loyalty_members")
    .select("id,member_number,email,points_balance,tier")
    .eq("member_number", memberIdentifier)
    .limit(1)
    .maybeSingle();

  let result = await query;
  if (result.error) throw result.error;
  if (result.data?.id !== undefined) return result.data;

  if (fallbackEmail) {
    result = await supabase
      .from("loyalty_members")
      .select("id,member_number,email,points_balance,tier")
      .ilike("email", fallbackEmail)
      .limit(1)
      .maybeSingle();
    if (result.error) throw result.error;
    if (result.data?.id !== undefined) return result.data;
  }

  return null;
}

async function findAwardByIdempotencyKey(idempotencyKey: string, context: { memberIdentifier: string; fallbackEmail?: string }) {
  const member = await findMemberSnapshot(context.memberIdentifier, context.fallbackEmail);
  if (!member?.id) return null;

  const [primaryRes, bonusRes] = await Promise.all([
    supabase
      .from("loyalty_transactions")
      .select("id,points")
      .eq("member_id", Number(member.id))
      .eq("receipt_id", idempotencyKey)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("loyalty_transactions")
      .select("promotion_campaign_id,campaign_id:promotion_campaign_id,points")
      .eq("member_id", Number(member.id))
      .ilike("receipt_id", `${idempotencyKey}:bonus:%`),
  ]);

  if (primaryRes.error) throw primaryRes.error;
  if (bonusRes.error) throw bonusRes.error;
  if (!primaryRes.data?.id) return null;

  const primaryPoints = Math.max(0, Number(primaryRes.data.points || 0));
  const bonusPointsAdded = ((bonusRes.data || []) as Array<{ points?: number; campaign_id?: string | null }>)
    .reduce((sum, row) => sum + Math.max(0, Number(row.points || 0)), 0);

  return {
    newBalance: Math.max(0, Number(member.points_balance || 0)),
    newTier: String(member.tier || "Bronze"),
    pointsAdded: primaryPoints + bonusPointsAdded,
    bonusPointsAdded,
    appliedCampaigns: ((bonusRes.data || []) as Array<{ campaign_id?: string | null; points?: number }>).map((row) => ({
      campaign_id: String(row.campaign_id || ""),
      campaign_name: "Previously applied campaign",
      campaign_type: "bonus_points",
      awarded_points: Math.max(0, Number(row.points || 0)),
      applied_multiplier: 1,
      minimum_purchase_amount: 0,
    })),
  };
}

const pointsApi = createPointsApi({
  awardMemberPoints,
  redeemMemberPoints: async () => {
    throw new Error("redeemMemberPoints is not available on the award route.");
  },
  findAwardByIdempotencyKey,
  findRedeemByIdempotencyKey: async () => null,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: { message: "Method not allowed." } });
  }

  try {
    const result = await pointsApi.award(req.body ?? {});
    return res.status(200).json(result);
  } catch (error) {
    const statusCode = Number((error as { statusCode?: number }).statusCode || 500);
    const message = error instanceof Error ? error.message : "Unable to award points.";
    return res.status(statusCode).json({ error: { message } });
  }
}
