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

function parseNumericId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

function parseUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function extractMissingColumn(error: unknown): string | null {
  const message = String((error as { message?: unknown })?.message ?? "");
  const schemaCacheMatch = message.match(/could not find the '([^']+)' column/i);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];

  const relationMatch = message.match(/column\s+[a-z0-9_."]+\.([a-z0-9_]+)\s+does not exist/i);
  if (relationMatch?.[1]) return relationMatch[1];

  return null;
}

const CACHE_TTL_MS = 60_000;
let tierRulesCache: { loadedAt: number; rules: TierRule[] } | null = null;
const rewardCatalogIdCache = new Map<string, { loadedAt: number; value: number | null }>();

async function findMember(identifier: string, fallbackEmail?: string): Promise<Member | null> {
  const trimmed = identifier.trim();
  const normalizedEmail = String(fallbackEmail ?? trimmed).trim();

  if (trimmed) {
    const memberNumberLookup = await supabase
      .from("loyalty_members")
      .select("id,member_id,member_number,email,points_balance,tier")
      .eq("member_number", trimmed)
      .limit(1)
      .maybeSingle();
    if (memberNumberLookup.error) throw memberNumberLookup.error;
    if (memberNumberLookup.data) return mapMember(memberNumberLookup.data);
  }

  const numericMemberId = parseNumericId(trimmed);
  if (numericMemberId !== null) {
    const memberIdLookup = await supabase
      .from("loyalty_members")
      .select("id,member_id,member_number,email,points_balance,tier")
      .eq("member_id", numericMemberId)
      .limit(1)
      .maybeSingle();
    if (memberIdLookup.error) throw memberIdLookup.error;
    if (memberIdLookup.data) return mapMember(memberIdLookup.data);
  }

  if (normalizedEmail) {
    const emailLookup = await supabase
      .from("loyalty_members")
      .select("id,member_id,member_number,email,points_balance,tier")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();
    if (emailLookup.error) throw emailLookup.error;
    if (emailLookup.data) return mapMember(emailLookup.data);
  }

  return null;
}

async function resolveRewardCatalogId(rewardCatalogId: string | number | undefined): Promise<number | null> {
  if (rewardCatalogId === undefined || rewardCatalogId === null) return null;

  const numericId = parseNumericId(rewardCatalogId);
  if (numericId !== null) return numericId;

  const rewardId = String(rewardCatalogId).trim();
  if (!rewardId) return null;
  const cached = rewardCatalogIdCache.get(rewardId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.value;

  const lookup = await supabase
    .from("rewards_catalog")
    .select("id")
    .eq("reward_id", rewardId)
    .limit(1)
    .maybeSingle();

  const resolved = lookup.error ? null : parseNumericId(lookup.data?.id) ?? null;
  rewardCatalogIdCache.set(rewardId, { loadedAt: Date.now(), value: resolved });
  return resolved;
}

async function fetchTierRules(): Promise<TierRule[]> {
  if (tierRulesCache && Date.now() - tierRulesCache.loadedAt < CACHE_TTL_MS) {
    return tierRulesCache.rules;
  }

  const { data, error } = await supabase
    .from("points_tiers")
    .select("tier_label,min_points,is_active")
    .eq("is_active", true)
    .order("min_points", { ascending: false });
  const rules = error ? normalizeTierRules(null) : normalizeTierRules(data as TierRule[]);
  tierRulesCache = { loadedAt: Date.now(), rules };
  return rules;
}

async function insertLedger(entry: any) {
  let payload = { ...entry };
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase.from("points_ledger").insert(payload).select("id").single();
    if (!error) return data;

    lastError = error;
    const missingColumn = extractMissingColumn(error);
    if (!missingColumn || !(missingColumn in payload)) throw error;

    const { [missingColumn]: _removed, ...rest } = payload;
    payload = rest;
  }

  throw lastError;
}

async function insertTransaction(entry: any) {
  let payload = { ...entry };
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { error } = await supabase.from("loyalty_transactions").insert(payload);
    if (!error) return;

    lastError = error;
    const missingColumn = extractMissingColumn(error);
    if (!missingColumn) throw error;

    if (missingColumn === "reason" && "reason" in payload) {
      const { reason, ...rest } = payload;
      payload = "description" in rest ? rest : { ...rest, description: reason };
      continue;
    }

    if (!(missingColumn in payload)) throw error;
    const { [missingColumn]: _removed, ...rest } = payload;
    payload = rest;
  }

  throw lastError;
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

  await Promise.all([
    insertTransaction({
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
    }),
    updateMemberBalance(member.id, newBalance, newTier),
  ]);
  return { ...ledgerEntry, id: ledger.id };
}

async function insertRedemption(member: Member, input: RedeemInput, newBalance: number, newTier: string) {
  const rewardCatalogIdPromise = resolveRewardCatalogId(input.rewardCatalogId);
  const rewardCatalogId = await rewardCatalogIdPromise;
  const promotionCampaignId = parseUuid(input.promotionCampaignId);
  const ledgerEntry = {
    member_id: member.id,
    change_type: input.transactionType ?? "REDEEM",
    points_delta: -Math.abs(Math.floor(input.points)),
    balance_after: newBalance,
    reason: input.reason,
    promotion_campaign_id: promotionCampaignId,
    reward_catalog_id: rewardCatalogId,
    source: "points-engine",
  };

  const ledger = await insertLedger(ledgerEntry);

  await Promise.all([
    insertTransaction({
      member_id: member.id,
      transaction_type: input.transactionType ?? "REDEEM",
      points: -Math.abs(Math.floor(input.points)),
      reason: input.reason,
      transaction_id: Math.trunc(Date.now() * 10),
      promotion_campaign_id: ledgerEntry.promotion_campaign_id,
      reward_catalog_id: ledgerEntry.reward_catalog_id,
      points_ledger_id: ledger.id,
    }),
    updateMemberBalance(member.id, newBalance, newTier),
  ]);
  void (async () => {
    try {
      const { error } = await supabase.rpc("loyalty_consume_points_fifo", {
        p_member_id: member.id,
        p_points_to_consume: Math.abs(Math.floor(input.points)),
      });
      if (error) console.warn("FIFO point consumption skipped:", error.message);
    } catch (error) {
      console.warn("FIFO point consumption skipped:", error instanceof Error ? error.message : error);
    }
  })();

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
