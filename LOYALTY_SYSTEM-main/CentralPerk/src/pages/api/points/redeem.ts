import type { NextApiRequest, NextApiResponse } from "next";

import { redeemMemberPoints } from "../../../app/lib/loyalty-supabase";
import { supabase } from "../../../utils/supabase/client";
import { createPointsApi } from "../../../server/api/points-core.mjs";

async function findMemberSnapshot(memberIdentifier: string, fallbackEmail?: string) {
  let result = await supabase
    .from("loyalty_members")
    .select("id,member_number,email,points_balance,tier")
    .eq("member_number", memberIdentifier)
    .limit(1)
    .maybeSingle();

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

async function findRedeemByIdempotencyKey(idempotencyKey: string, context: { memberIdentifier: string; fallbackEmail?: string }) {
  const member = await findMemberSnapshot(context.memberIdentifier, context.fallbackEmail);
  if (!member?.id) return null;

  const result = await supabase
    .from("loyalty_transactions")
    .select("id,points")
    .eq("member_id", Number(member.id))
    .eq("receipt_id", idempotencyKey)
    .limit(1)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data?.id) return null;

  return {
    newBalance: Math.max(0, Number(member.points_balance || 0)),
    newTier: String(member.tier || "Bronze"),
    pointsDeducted: Math.abs(Number(result.data.points || 0)),
  };
}

const pointsApi = createPointsApi({
  awardMemberPoints: async () => {
    throw new Error("awardMemberPoints is not available on the redeem route.");
  },
  redeemMemberPoints,
  findAwardByIdempotencyKey: async () => null,
  findRedeemByIdempotencyKey,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: { message: "Method not allowed." } });
  }

  try {
    const result = await pointsApi.redeem(req.body ?? {});
    return res.status(200).json(result);
  } catch (error) {
    const statusCode = Number((error as { statusCode?: number }).statusCode || 500);
    const message = error instanceof Error ? error.message : "Unable to redeem points.";
    return res.status(statusCode).json({ error: { message } });
  }
}
