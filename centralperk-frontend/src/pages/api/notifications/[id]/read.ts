import type { NextApiRequest, NextApiResponse } from "next";

import { fetchServiceJson } from "../../../../server/api-fallback";
import { createNotificationServerSupabaseClient } from "../../../../server/supabase-admin";

async function markReadInNotificationDb(id: string) {
  const supabase = createNotificationServerSupabaseClient();
  const { error } = await supabase.from("notification_outbox").update({ status: "read" }).eq("id", id);
  if (error) throw error;
  return { ok: true };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) return res.status(400).json({ ok: false, error: { message: "Notification ID is required." } });

  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    const payload = await fetchServiceJson(
      req,
      "NOTIFICATION_SERVICE_URL",
      "http://127.0.0.1:4005",
      `/notifications/${encodeURIComponent(id)}/read`,
    ).catch(() => markReadInNotificationDb(id));
    return res.status(200).json(payload);
  } catch {
    return res.status(200).json({ ok: true });
  }
}
