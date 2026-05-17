import type { NextApiRequest, NextApiResponse } from "next";

import { fetchServiceJson } from "../../../server/api-fallback";
import { createNotificationServerSupabaseClient } from "../../../server/supabase-admin";

async function loadFromNotificationDb() {
  const supabase = createNotificationServerSupabaseClient();
  const { data, error } = await supabase.from("notification_outbox").select("channel,status").limit(5000);
  if (error) throw error;

  const byChannel: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const row of data || []) {
    const channel = String((row as any).channel ?? "unknown");
    const status = String((row as any).status ?? "pending");
    byChannel[channel] = (byChannel[channel] || 0) + 1;
    byStatus[status] = (byStatus[status] || 0) + 1;
  }
  return { ok: true, analytics: { total: (data || []).length, byChannel, byStatus } };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    const payload = await fetchServiceJson(req, "NOTIFICATION_SERVICE_URL", "http://127.0.0.1:4005", "/communications/analytics").catch(() =>
      loadFromNotificationDb(),
    );
    return res.status(200).json(payload);
  } catch {
    return res.status(200).json({ ok: true, analytics: { total: 0, byChannel: {}, byStatus: {} } });
  }
}
