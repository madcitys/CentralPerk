import { updateApiState, withApiState, type LocalCommunicationPreferenceRecord } from "./local-store";

export const defaultLocalCommunicationPreference: LocalCommunicationPreferenceRecord = {
  sms: true,
  email: true,
  push: true,
  promotionalOptIn: true,
  frequency: "weekly",
};

function notificationId() {
  return `notif-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function preferenceKey(memberId: string) {
  return memberId.trim().toLowerCase();
}

function canSend(
  preference: LocalCommunicationPreferenceRecord,
  channel: "sms" | "email" | "push",
  isTransactional: boolean,
) {
  if (isTransactional) return true;
  if (preference.frequency === "never") return false;
  if (!preference.promotionalOptIn) return false;
  return channel === "sms" ? preference.sms : channel === "email" ? preference.email : preference.push;
}

export async function loadLocalCommunicationPreference(memberId: string) {
  return withApiState((state) => state.communicationPreferences[preferenceKey(memberId)] ?? defaultLocalCommunicationPreference);
}

export async function saveLocalCommunicationPreference(
  memberId: string,
  preference: LocalCommunicationPreferenceRecord,
) {
  return updateApiState((state) => {
    state.communicationPreferences[preferenceKey(memberId)] = preference;
    return preference;
  });
}

export async function queueLocalMemberNotification(input: {
  memberId: string;
  channel: "sms" | "email" | "push";
  subject: string;
  message: string;
  isTransactional?: boolean;
  scheduledFor?: string | null;
}) {
  const preference = await loadLocalCommunicationPreference(input.memberId);
  const isTransactional = Boolean(input.isTransactional);
  if (!canSend(preference, input.channel, isTransactional)) {
    return { queued: false as const, reason: "preference_blocked" as const };
  }

  return updateApiState((state) => {
    const record = {
      id: notificationId(),
      memberId: input.memberId,
      channel: input.channel,
      subject: input.subject,
      message: input.message,
      status: "pending" as const,
      isPromotional: !isTransactional,
      scheduledFor: input.scheduledFor ?? null,
      createdAt: new Date().toISOString(),
    };
    state.notifications.unshift(record);
    state.notifications = state.notifications.slice(0, 500);
    return { queued: true as const, notification: record };
  });
}

export async function listLocalNotifications(input: { memberId?: string; limit?: number } = {}) {
  const limit = Math.min(100, Math.max(1, input.limit ?? 20));
  return withApiState((state) =>
    state.notifications
      .filter((item) => !input.memberId || item.memberId === input.memberId)
      .slice()
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        subject: item.subject,
        message: item.message,
        createdAt: item.createdAt,
        status: item.status,
        channel: item.channel,
      })),
  );
}

export async function markLocalNotificationRead(id: string) {
  return updateApiState((state) => {
    const notification = state.notifications.find((item) => item.id === id);
    if (notification) notification.status = "read";
    return Boolean(notification);
  });
}

export async function localCommunicationAnalytics() {
  return withApiState((state) => {
    const byChannel: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const item of state.notifications) {
      byChannel[item.channel] = (byChannel[item.channel] || 0) + 1;
      byStatus[item.status] = (byStatus[item.status] || 0) + 1;
    }

    return {
      total: state.notifications.length,
      byChannel,
      byStatus,
    };
  });
}
