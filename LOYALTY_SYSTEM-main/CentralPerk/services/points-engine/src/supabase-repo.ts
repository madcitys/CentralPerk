import type { PointsRepository } from "./core/repo.js";
import type { AwardInput, RedeemInput, Member, TierRule, ExpiryResult } from "./core/types.js";
import { supabase } from "./supabase-client.js";
import { normalizeTierRules } from "./core/utils.js";

function mapMember(row: any): Member {
  return {
    id: Number(row.id ?? row.member_id),
    member_number: row.member_number,
    email: row.email,
    points_balance: Math.max(0, Math.floor(Number(row.points_balance) || 0)),
    tier: row.tier,
  };
}

async function findMember(identifier: string, fallbackEmail?: string): Promise<Member | null> {
  const trimmed = identifier.trim();
  const { data, error } = await supabase
    .from("loyalty_members")
    .select("id,member_id,member_number,email,points_balance,tier")
    .or(`member_number.eq.${trimmed},member_id.eq.${trimmed},email.eq.${fallbackEmail ?? trimmed}`)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapMember(data);
}

async function fetchTierRules(): Promise<TierRule[]> {
  const { data, error } = await supabase
    .from("points_tiers")
    .select("tier_label,min_points,is_active")
    .eq("is_active", true)
    .order("min_points", { ascending: false });
  if (error) return normalizeTierRules(null);
  return normalizeTierRules(data as TierRule[]);
}

async function insertLedger(entry: any) {
  const { data, error } = await supabase.from("points_ledger").insert(entry).select("id").single();
  if (error) throw error;
  return data;
}

async function insertTransaction(entry: any) {
  const { error } = await supabase.from("loyalty_transactions").insert(entry);
  if (error) throw error;
}

async function updateMemberBalance(memberId: number, newBalance: number, newTier: string) {
  const { error } = await supabase
    .from("loyalty_members")
    .update({ points_balance: newBalance, tier: newTier })
    .eq("id", memberId);
  if (error) throw error;
}

async function insertAward(member: Member, input: AwardInput, newBalance: number, newTier: string) {
  const ledgerEntry = {
    member_id: member.id,
    change_type: input.transactionType,
    points_delta: Math.max(0, Math.floor(input.points)),
    balance_after: newBalance,
    reason: input.reason,
    expiry_date:
      input.transactionType === "PURCHASE"
        ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        : null,
    promotion_campaign_id: null,
    reward_catalog_id: null,
    source: "points-engine",
  };

  const ledger = await insertLedger(ledgerEntry);

  await insertTransaction({
    member_id: member.id,
    transaction_type: input.transactionType,
    points: Math.max(0, Math.floor(input.points)),
    amount_spent: input.amountSpent ?? 0,
    reason: input.reason,
    transaction_id: Math.trunc(Date.now() * 10),
    product_code: input.productCode ?? null,
    product_category: input.productCategory ?? null,
    expiry_date: ledgerEntry.expiry_date,
    points_ledger_id: ledger.id,
  });

  await updateMemberBalance(member.id, newBalance, newTier);
  return { ...ledgerEntry, id: ledger.id };
}

async function insertRedemption(member: Member, input: RedeemInput, newBalance: number, newTier: string) {
  const ledgerEntry = {
    member_id: member.id,
    change_type: input.transactionType ?? "REDEEM",
    points_delta: -Math.abs(Math.floor(input.points)),
    balance_after: newBalance,
    reason: input.reason,
    promotion_campaign_id: input.promotionCampaignId ?? null,
    reward_catalog_id:
      input.rewardCatalogId === undefined || input.rewardCatalogId === null
        ? null
        : Number(input.rewardCatalogId),
    source: "points-engine",
  };

  const ledger = await insertLedger(ledgerEntry);

  await insertTransaction({
    member_id: member.id,
    transaction_type: input.transactionType ?? "REDEEM",
    points: -Math.abs(Math.floor(input.points)),
    reason: input.reason,
    transaction_id: Math.trunc(Date.now() * 10),
    promotion_campaign_id: ledgerEntry.promotion_campaign_id,
    reward_catalog_id: ledgerEntry.reward_catalog_id,
    points_ledger_id: ledger.id,
  });

  // Consume FIFO lots if the helper exists
  try {
    const { error: fifoError } = await supabase.rpc("loyalty_consume_points_fifo", {
      p_member_id: member.id,
      p_points_to_consume: Math.abs(Math.floor(input.points)),
    });
    if (fifoError) throw fifoError;
  } catch (err) {
    // Ignore missing function or other non-fatal FIFO issues to keep redemption flowing.
  }

  await updateMemberBalance(member.id, newBalance, newTier);
  return { ...ledgerEntry, id: ledger.id };
}

async function runExpiryJob(): Promise<ExpiryResult> {
  const { data, error } = await supabase.rpc("points_run_nightly_expiry");
  if (error) throw error;
  const result = Array.isArray(data) && data.length > 0 ? data[0] : data;
  return {
    membersProcessed: Number(result?.members_processed ?? 0),
    pointsExpired: Number(result?.points_expired ?? result ?? 0),
  };
}

export const supabaseRepo: PointsRepository = {
  findMember,
  fetchTierRules,
  insertAward,
  insertRedemption,
  runExpiryJob,
};
