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

function mapLegacyTransactionRow(row: Record<string, any>) {
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

async function findMemberInMemberDb(identifier: string, fallbackEmail: string) {
  const supabase = createMemberServerSupabaseClient();
  const candidates = [identifier, fallbackEmail].map((item) => item.trim()).filter(Boolean);

  for (const candidate of candidates) {
    let query = supabase
      .from("loyalty_members")
      .select("id,member_id,member_number,email,points_balance,tier")
      .limit(1);
    const escaped = candidate.replaceAll(",", "\\,");
    if (Number.isFinite(Number(candidate))) {
      query = query.or(`member_number.eq.${escaped},member_id.eq.${escaped},id.eq.${Number(candidate)},email.ilike.${escaped}`);
    } else {
      query = query.or(`member_number.eq.${escaped},email.ilike.${escaped}`);
    }
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (data) return data as Record<string, any>;
  }

  return null;
}

async function loadMemberDbActivity(identifier: string, fallbackEmail: string, limit: number) {
  const member = await findMemberInMemberDb(identifier, fallbackEmail);
  if (!member?.id) return null;

  const supabase = createMemberServerSupabaseClient();
  const memberKeys = [
    Number(member.id),
    Number(member.member_id),
  ].filter((value, index, all) => Number.isFinite(value) && all.indexOf(value) === index);
  const memberKeySet = new Set(memberKeys.map((value) => String(value)));

  let { data, error } = await supabase
    .from("loyalty_transactions")
    .select("id,member_id,transaction_id,transaction_type,points,reason,reward_catalog_id,promotion_campaign_id,expiry_date,transaction_date,receipt_id,amount_spent,product_code,product_category")
    .in("member_id", memberKeys.length ? memberKeys : [Number(member.id)])
    .order("transaction_date", { ascending: false })
    .limit(limit);

  if (error || (data || []).length === 0) {
    const fallback = await supabase
      .from("loyalty_transactions")
      .select("id,member_id,transaction_id,transaction_type,points,reason,reward_catalog_id,promotion_campaign_id,expiry_date,transaction_date,receipt_id,amount_spent,product_code,product_category")
      .order("transaction_date", { ascending: false })
      .limit(Math.max(limit, 200));

    if (!fallback.error) {
      data = (fallback.data || [])
        .filter((row: any) => memberKeySet.has(String(row.member_id)))
        .slice(0, limit);
    }
  }

  return {
    ok: true,
    balance: {
      member_id: member.member_number ?? identifier,
      points_balance: Number(member.points_balance ?? 0),
      tier: String(member.tier ?? "Bronze"),
    },
    history: (data || []).map((row) => mapLegacyTransactionRow(row as Record<string, any>)),
  };
}

async function loadPointsLedgerForMember(
  supabase: ReturnType<typeof createPointsServerSupabaseClient>,
  member: Record<string, any>,
  identifier: string,
  limit: number,
) {
  const memberKeys = [
    Number(member.id),
    Number(member.member_id),
  ].filter((value, index, all) => Number.isFinite(value) && all.indexOf(value) === index);
  if (memberKeys.length === 0) return null;

  const { data, error } = await supabase
    .from("points_ledger")
    .select("id,member_id,change_type,points_delta,balance_after,reason,reward_catalog_id,promotion_campaign_id,expiry_date,created_at")
    .in("member_id", memberKeys)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || (data || []).length === 0) return null;

  return {
    ok: true,
    balance: {
      member_id: member.member_number ?? identifier,
      points_balance: Number(member.points_balance ?? 0),
      tier: String(member.tier ?? "Bronze"),
    },
    history: (data || []).map((row) => mapLedgerRow(row as Record<string, any>)),
  };
}

async function loadFromPointsDb(req: NextApiRequest) {
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit || 500) || 500));
  const identifier = String(req.query.memberIdentifier || "").trim();
  const fallbackEmail = String(req.query.fallbackEmail || "").trim();
  const memberDbMember = await findMemberInMemberDb(identifier, fallbackEmail).catch(() => null);
  const memberDbActivity = await loadMemberDbActivity(identifier, fallbackEmail, limit).catch(() => null);

  let supabase: ReturnType<typeof createPointsServerSupabaseClient>;
  try {
    supabase = createPointsServerSupabaseClient();
  } catch {
    return memberDbActivity ?? {
      ok: true,
      balance: { member_id: identifier, points_balance: 0, tier: "Bronze" },
      history: [],
    };
  }

  let member: any = null;
  if (identifier || fallbackEmail) {
    const memberLookup = await supabase
      .from("loyalty_members")
      .select("id,member_id,member_number,email,points_balance,tier")
      .or(`member_number.eq.${identifier},member_id.eq.${identifier},email.eq.${fallbackEmail || identifier}`)
      .limit(1)
      .maybeSingle();
    if (!memberLookup.error) member = memberLookup.data;
  }

  const memberLedgerActivity = memberDbMember
    ? await loadPointsLedgerForMember(supabase, memberDbMember, identifier, limit).catch(() => null)
    : null;

  if (!member?.id) {
    if (memberLedgerActivity && (memberLedgerActivity.history || []).length > (memberDbActivity?.history || []).length) {
      return memberLedgerActivity;
    }
    return memberDbActivity ?? {
      ok: true,
      balance: { member_id: identifier, points_balance: 0, tier: "Bronze" },
      history: [],
    };
  }

  const { data, error } = await supabase
    .from("points_ledger")
    .select("id,member_id,change_type,points_delta,balance_after,reason,reward_catalog_id,promotion_campaign_id,expiry_date,created_at")
    .eq("member_id", Number(member.id))
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const pointsPayload = {
    ok: true,
    balance: {
      member_id: member.member_number ?? identifier,
      points_balance: Number(member.points_balance ?? 0),
      tier: String(member.tier ?? "Bronze"),
    },
    history: (data || []).map((row) => mapLedgerRow(row as Record<string, any>)),
  };

  if (pointsPayload.history.length === 0 || Number(pointsPayload.balance.points_balance) === 0) {
    if (memberLedgerActivity && (memberLedgerActivity.history || []).length > pointsPayload.history.length) {
      return memberLedgerActivity;
    }
    if (memberDbActivity && (memberDbActivity.history.length > 0 || Number(memberDbActivity.balance.points_balance) > Number(pointsPayload.balance.points_balance))) {
      return memberDbActivity;
    }
  }

  if (memberLedgerActivity && (memberLedgerActivity.history || []).length > pointsPayload.history.length) {
    return memberLedgerActivity;
  }

  return pointsPayload;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    const payload = await fetchServiceJson(req, "POINTS_SERVICE_URL", "http://127.0.0.1:4001", "/points/activity").catch(() =>
      loadFromPointsDb(req),
    );
    if (req.query.memberIdentifier || req.query.fallbackEmail) {
      const fallbackPayload = await loadFromPointsDb(req).catch(() => null);
      if (
        fallbackPayload &&
        (Number(fallbackPayload.balance?.points_balance ?? 0) > Number(payload?.balance?.points_balance ?? 0) ||
          (fallbackPayload.history || []).length > (payload?.history || []).length)
      ) {
        return res.status(200).json(fallbackPayload);
      }
    }

    return res.status(200).json(payload);
  } catch {
    return res.status(200).json({
      ok: true,
      balance: { member_id: String(req.query.memberIdentifier || ""), points_balance: 0, tier: "Bronze" },
      history: [],
    });
  }
}
