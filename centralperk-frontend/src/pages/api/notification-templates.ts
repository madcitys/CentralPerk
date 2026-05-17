import type { NextApiRequest, NextApiResponse } from "next";

import { fetchServiceJson, tableMissing } from "../../server/api-fallback";
import { createNotificationServerSupabaseClient } from "../../server/supabase-admin";

async function loadFromNotificationDb() {
  const supabase = createNotificationServerSupabaseClient();
  const { data, error } = await supabase
    .from("notification_templates")
    .select("id,template_name,trigger_event,subject,message")
    .eq("is_active", true)
    .order("template_name", { ascending: true });
  if (error) {
    if (tableMissing(error, "notification_templates")) return { ok: true, templates: [] };
    throw error;
  }
  return { ok: true, templates: data || [] };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    const payload = await fetchServiceJson(req, "NOTIFICATION_SERVICE_URL", "http://127.0.0.1:4005", "/notification-templates").catch(() =>
      loadFromNotificationDb(),
    );
    return res.status(200).json(payload);
  } catch {
    return res.status(200).json({ ok: true, templates: [] });
  }
}
