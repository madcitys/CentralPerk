import { supabase } from "../../utils/supabase/client";
import { getCurrentCustomerSession } from "../auth/auth";
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

function dedupeNotifications(rows: Record<string, any>[]) {
  return Array.from(
    new Map(
      rows
        .sort(
          (left, right) =>
            new Date(String(right.created_at ?? 0)).getTime() - new Date(String(left.created_at ?? 0)).getTime()
        )
        .map((row) => [`${String(row.subject ?? "")}__${String(row.message ?? "")}`, row])
    ).values()
  );
}

export async function loadUserNotifications(limit = 20): Promise<AppNotification[]> {
  const localSession = getCurrentCustomerSession();
  const authRes = await supabase.auth.getUser();
  if (authRes.error && !localSession) throw authRes.error;

  const userId = authRes.data.user?.id;
  const authEmail = String(authRes.data.user?.email || localSession?.email || "").trim();
  const memberNumber = String(localSession?.memberId || "").trim();
  const rpcAttempt = await supabase.rpc("loyalty_my_notifications", {
    p_member_number: memberNumber || null,
    p_email: authEmail || null,
    p_limit: limit,
  });
  if (!rpcAttempt.error) {
    return dedupeNotifications((rpcAttempt.data || []) as Record<string, any>[])
      .slice(0, limit)
      .map((row) => normalizeNotification(row));
  }

  let memberId: number | null = null;

  if (localSession?.memberId) {
    const memberRes = await supabase
      .from("loyalty_members")
      .select("id")
      .eq("member_number", localSession.memberId)
      .limit(1)
      .maybeSingle();

    if (memberRes.error) throw memberRes.error;
    if (memberRes.data?.id !== undefined) memberId = Number(memberRes.data.id);
  }

  if (memberId === null && authEmail) {
    const memberRes = await supabase
      .from("loyalty_members")
      .select("id")
      .ilike("email", authEmail)
      .limit(1)
      .maybeSingle();

    if (memberRes.error) throw memberRes.error;
    if (memberRes.data?.id !== undefined) memberId = Number(memberRes.data.id);
  }

  const rows: Record<string, any>[] = [];

  if (memberId !== null) {
    const memberQuery = await supabase
      .from("notification_outbox")
      .select("id,subject,message,created_at,status,user_id,member_id")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (memberQuery.error) throw memberQuery.error;
    rows.push(...((memberQuery.data || []) as Record<string, any>[]));
  }

  if (userId) {
    const userQuery = await supabase
      .from("notification_outbox")
      .select("id,subject,message,created_at,status,user_id,member_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (userQuery.error) throw userQuery.error;
    rows.push(...((userQuery.data || []) as Record<string, any>[]));
  }

  if (rows.length === 0 && !userId && memberId === null) {
    const fallbackQuery = await supabase
      .from("notification_outbox")
      .select("id,subject,message,created_at,status,user_id,member_id")
      .is("user_id", null)
      .is("member_id", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (fallbackQuery.error) throw fallbackQuery.error;
    rows.push(...((fallbackQuery.data || []) as Record<string, any>[]));
  }

  const uniqueRows = dedupeNotifications(rows).slice(0, limit);

  return uniqueRows.map((row) => normalizeNotification(row));
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

export async function ensureMemberNotification(input: {
  memberId: string;
  channel: "sms" | "email" | "push";
  subject: string;
  message: string;
  userId?: string | null;
  isTransactional?: boolean;
}) {
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
    memberPk = Number(input.memberId);
  }

  if (memberPk !== null) {
    const existingNotification = await supabase
      .from("notification_outbox")
      .select("id")
      .eq("member_id", memberPk)
      .eq("channel", input.channel)
      .eq("subject", input.subject)
      .eq("message", input.message)
      .limit(1)
      .maybeSingle();
    if (existingNotification.error) throw existingNotification.error;
    if (existingNotification.data?.id) {
      return { queued: false as const, reason: "duplicate" as const };
    }
  }

  return queueMemberNotification(input);
}
