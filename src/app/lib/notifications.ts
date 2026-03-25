import { supabase } from "../../utils/supabase/client";
import { canSendNotificationByPreference, loadCommunicationPreference } from "./member-lifecycle";

export type AppNotification = {
  id: string;
  subject: string;
  message: string;
  createdAt: string;
  status: string;
};

function normalizeNotification(row: Record<string, any>): AppNotification {
  return {
    id: String(row.id ?? crypto.randomUUID()),
    subject: String(row.subject ?? "Notification"),
    message: String(row.message ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    status: String(row.status ?? "pending"),
  };
}

export async function loadUserNotifications(limit = 20): Promise<AppNotification[]> {
  const authRes = await supabase.auth.getUser();
  if (authRes.error) throw authRes.error;

  const userId = authRes.data.user?.id;
  const authEmail = String(authRes.data.user?.email || "").trim();
  let memberId: number | null = null;

  if (authEmail) {
    const memberRes = await supabase
      .from("loyalty_members")
      .select("id")
      .ilike("email", authEmail)
      .limit(1)
      .maybeSingle();

    if (memberRes.error) throw memberRes.error;
    if (memberRes.data?.id !== undefined) memberId = Number(memberRes.data.id);
  }

  let query = supabase
    .from("notification_outbox")
    .select("id,subject,message,created_at,status,user_id,member_id")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (userId && memberId !== null) {
    query = query.or(`user_id.eq.${userId},member_id.eq.${memberId},and(user_id.is.null,member_id.is.null)`);
  } else if (userId) {
    query = query.or(`user_id.eq.${userId},and(user_id.is.null,member_id.is.null)`);
  } else if (memberId !== null) {
    query = query.or(`member_id.eq.${memberId},and(user_id.is.null,member_id.is.null)`);
  } else {
    query = query.is("user_id", null).is("member_id", null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => normalizeNotification(row as Record<string, any>));
}

export async function queueSmsNotification(input: {
  userId?: string | null;
  subject: string;
  message: string;
}) {
  const { error } = await supabase.from("notification_outbox").insert({
    user_id: input.userId ?? null,
    channel: "sms",
    subject: input.subject,
    message: input.message,
  });
  if (error) throw error;
}


export async function queueMemberNotification(input: {
  memberId: string;
  userId?: string | null;
  channel: "sms" | "email" | "push";
  subject: string;
  message: string;
  isTransactional?: boolean;
}) {
  const pref = await loadCommunicationPreference(input.memberId);
  const isTransactional = Boolean(input.isTransactional);
  const allowed = canSendNotificationByPreference(pref, input.channel, isTransactional);
  if (!allowed) return { queued: false, reason: "preference_blocked" as const };

  let memberPk: number | null = null;
  const byMemberNumber = await supabase
    .from("loyalty_members")
    .select("id")
    .eq("member_number", input.memberId)
    .limit(1)
    .maybeSingle();

  if (byMemberNumber.error) throw byMemberNumber.error;
  if (byMemberNumber.data?.id !== undefined) {
    memberPk = Number(byMemberNumber.data.id);
  } else if (Number.isFinite(Number(input.memberId))) {
    const byId = await supabase
      .from("loyalty_members")
      .select("id")
      .eq("id", Number(input.memberId))
      .limit(1)
      .maybeSingle();

    if (byId.error) throw byId.error;
    if (byId.data?.id !== undefined) memberPk = Number(byId.data.id);
  }

  if (!isTransactional && input.userId && pref.frequency !== "daily") {
    const lookbackDays = pref.frequency === "weekly" ? 7 : 1;
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    const recentRes = await supabase
      .from("notification_outbox")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .eq("channel", input.channel)
      .eq("is_promotional", true)
      .gte("created_at", since);
    if (recentRes.error) throw recentRes.error;
    if ((recentRes.count || 0) > 0) return { queued: false, reason: "frequency_blocked" as const };
  }

  const { error } = await supabase.from("notification_outbox").insert({
    user_id: input.userId ?? null,
    member_id: memberPk,
    channel: input.channel,
    subject: input.subject,
    message: input.message,
    is_promotional: !isTransactional,
  });

  if (error) throw error;
  return { queued: true as const };
}
