import type { NextApiRequest, NextApiResponse } from "next";

import { fetchServiceJson } from "../../../server/api-fallback";
import { createMemberServerSupabaseClient, createPointsServerSupabaseClient } from "../../../server/supabase-admin";

function mapLedgerRow(row: Record<string, any>) {
  return {
    id: row.id,
    member_id: row.member_id,
    transaction_id: row.id,
    transaction_type: row.change_type,
    points: Number(row.points_delta || 0),
    balance: row.balance_after === null || row.balance_after === undefined ? null : Number(row.balance_after),
    transaction_date: row.created_at,
    expiry_date: row.expiry_date ?? null,
    reason: row.reason ?? "",
    reward_catalog_id: row.reward_catalog_id ?? null,
    promotion_campaign_id: row.promotion_campaign_id ?? null,
  };
}

function mapMemberTransactionRow(row: Record<string, any>) {
  return {
    id: row.id ?? row.transaction_id,
    member_id: row.member_id,
    transaction_id: row.transaction_id ?? row.id,
    transaction_type: row.transaction_type ?? row.change_type,
    points: Number(row.points ?? row.points_delta ?? 0),
    balance: row.balance === null || row.balance === undefined ? null : Number(row.balance),
    transaction_date: row.transaction_date ?? row.created_at,
    expiry_date: row.expiry_date ?? null,
    reason: row.reason ?? row.description ?? "",
    reward_catalog_id: row.reward_catalog_id ?? null,
    promotion_campaign_id: row.promotion_campaign_id ?? null,
  };
}

async function loadFromMemberDb(req: NextApiRequest) {
  const limit = Math.min(5000, Math.max(1, Number(req.query.limit || 1000) || 1000));
  const supabase = createMemberServerSupabaseClient();
  const { data, error } = await supabase
    .from("loyalty_transactions")
    .select("id,member_id,transaction_id,transaction_type,points,reason,reward_catalog_id,promotion_campaign_id,expiry_date,transaction_date,receipt_id,amount_spent,product_code,product_category")
    .order("transaction_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return { ok: true, transactions: (data || []).map((row) => mapMemberTransactionRow(row as Record<string, any>)) };
}

async function loadFromPointsDb(req: NextApiRequest) {
  const limit = Math.min(5000, Math.max(1, Number(req.query.limit || 1000) || 1000));
  let supabase: ReturnType<typeof createPointsServerSupabaseClient>;
  try {
    supabase = createPointsServerSupabaseClient();
  } catch {
    return loadFromMemberDb(req);
  }

  const { data, error } = await supabase
    .from("points_ledger")
    .select("id,member_id,change_type,points_delta,balance_after,reason,reward_catalog_id,promotion_campaign_id,expiry_date,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return { ok: true, transactions: (data || []).map((row) => mapLedgerRow(row as Record<string, any>)) };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    const payload = await fetchServiceJson(req, "POINTS_SERVICE_URL", "http://127.0.0.1:4001", "/points/ledger").catch(() =>
      loadFromPointsDb(req),
    );
    if ((payload?.transactions || []).length === 0) {
      const memberPayload = await loadFromMemberDb(req).catch(() => null);
      if ((memberPayload?.transactions || []).length > 0) return res.status(200).json(memberPayload);
    }
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(200).json({ ok: true, transactions: [] });
  }
}
