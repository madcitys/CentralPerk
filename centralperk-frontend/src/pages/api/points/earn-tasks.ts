import type { NextApiRequest, NextApiResponse } from "next";

import { fetchServiceJson, tableMissing } from "../../../server/api-fallback";
import { createPointsServerSupabaseClient } from "../../../server/supabase-admin";

const DEFAULT_EARN_TASKS = [
  {
    id: "E001",
    task_code: "E001",
    title: "Complete your profile",
    description: "Keep your member details current.",
    points: 100,
    icon_key: "user",
    is_active: true,
  },
  {
    id: "E002",
    task_code: "E002",
    title: "Record a pharmacy purchase",
    description: "Log an eligible pharmacy receipt.",
    points: 50,
    icon_key: "receipt",
    is_active: true,
  },
  {
    id: "E003",
    task_code: "E003",
    title: "Refer a friend",
    description: "Invite another member to GREENOVATE.",
    points: 250,
    icon_key: "users",
    is_active: true,
  },
];

async function loadFromPointsDb() {
  const supabase = createPointsServerSupabaseClient();
  const { data, error } = await supabase.from("earn_tasks").select("*").eq("is_active", true).order("points", { ascending: false });

  if (error) {
    if (tableMissing(error, "earn_tasks")) return { ok: true, earnTasks: DEFAULT_EARN_TASKS };
    throw error;
  }

  return { ok: true, earnTasks: data?.length ? data : DEFAULT_EARN_TASKS };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    const payload = await fetchServiceJson(req, "POINTS_SERVICE_URL", "http://127.0.0.1:4001", "/points/earn-tasks").catch(() =>
      loadFromPointsDb(),
    );
    return res.status(200).json(payload);
  } catch {
    return res.status(200).json({ ok: true, earnTasks: DEFAULT_EARN_TASKS });
  }
}
