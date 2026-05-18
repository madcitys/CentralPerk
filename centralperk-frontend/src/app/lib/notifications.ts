import { supabase } from "../../utils/supabase/client";
import { getCurrentCustomerSession } from "../auth/auth";
import { canSendNotificationByPreference, loadCommunicationPreference } from "./member-lifecycle";
import { requestJson } from "./api";

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

  const authEmail = String(authRes.data.user?.email || localSession?.email || "").trim();
  const memberNumber = String(localSession?.memberId || "").trim();
  const params = new URLSearchParams({ limit: String(limit) });
  if (memberNumber) params.set("memberId", memberNumber);
  if (authEmail) params.set("email", authEmail);

  const response = await requestJson<{ ok: true; notifications: AppNotification[] }>(`/api/notifications?${params.toString()}`);
  return (response.notifications || []).slice(0, limit);
}

export async function queueSmsNotification(input: {
  userId?: string | null;
  subject: string;
  message: string;
}) {
  await requestJson<{ ok: true }>("/api/notifications", {
    method: "POST",
    body: JSON.stringify({
      userId: input.userId ?? null,
      channel: "sms",
      subject: input.subject,
      body: input.message,
    }),
  });
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

  await requestJson<{ ok: true }>("/api/notifications", {
    method: "POST",
    body: JSON.stringify({
      userId: input.userId ?? null,
      memberId: input.memberId,
      channel: input.channel,
      subject: input.subject,
      body: input.message,
      isPromotional: !isTransactional,
    }),
  });
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
  return queueMemberNotification(input);
}
