import type { NextApiRequest, NextApiResponse } from "next";

import { fetchServiceJson } from "../../../server/api-fallback";
import { createNotificationServerSupabaseClient } from "../../../server/supabase-admin";

function mapNotification(row: Record<string, any>) {
  return {
    id: String(row.id ?? ""),
    subject: String(row.subject ?? "Notification"),
    message: String(row.message ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    created_at: String(row.created_at ?? new Date().toISOString()),
    status: String(row.status ?? "pending"),
    member_id: row.member_id ?? null,
    user_id: row.user_id ?? null,
    channel: row.channel ?? null,
  };
}

async function loadFromNotificationDb(req: NextApiRequest) {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20) || 20));
  const supabase = createNotificationServerSupabaseClient();
  let query = supabase
    .from("notification_outbox")
    .select("id,subject,message,created_at,status,member_id,user_id,channel")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (req.query.memberId && Number.isFinite(Number(req.query.memberId))) {
    query = query.eq("member_id", Number(req.query.memberId));
  }

  const { data, error } = await query;
  if (error) throw error;
  return { ok: true, notifications: (data || []).map((row) => mapNotification(row as Record<string, any>)) };
}

async function saveToNotificationDb(req: NextApiRequest) {
  const body = req.body || {};
  const supabase = createNotificationServerSupabaseClient();
  const { data, error } = await supabase
    .from("notification_outbox")
    .insert({
      member_id: body.memberId !== undefined && Number.isFinite(Number(body.memberId)) ? Number(body.memberId) : null,
      user_id: body.userId ?? null,
      channel: body.channel ?? "push",
      subject: body.subject ?? null,
      message: body.body ?? body.message ?? "",
      status: body.status ?? "queued",
    })
    .select("id,subject,message,created_at,status,member_id,user_id,channel")
    .single();
  if (error) throw error;
  return { ok: true, notification: mapNotification(data as Record<string, any>) };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!["GET", "POST"].includes(String(req.method))) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    let payload;
    try {
      payload = await fetchServiceJson(req, "NOTIFICATION_SERVICE_URL", "http://127.0.0.1:4005", "/notifications");
    } catch {
      payload = req.method === "POST" ? await saveToNotificationDb(req) : await loadFromNotificationDb(req);
    }
    return res.status(200).json(payload);
  } catch {
    return res.status(200).json(req.method === "POST" ? { ok: true, notification: null } : { ok: true, notifications: [] });
  }
}
