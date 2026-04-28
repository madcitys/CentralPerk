import { BadRequestException, Injectable } from "@nestjs/common";
import { LocalRuntimeService } from "../local-runtime/local-runtime.service";
import { cleanString, nowIso } from "../common/utils";

@Injectable()
export class CommunicationsService {
  private analyticsCache: { loadedAt: number; value: Record<string, unknown> } | null = null;
  private notificationsCache = new Map<string, { loadedAt: number; value: Array<Record<string, unknown>> }>();

  constructor(private readonly runtime: LocalRuntimeService) {}

  private isFresh(loadedAt: number) {
    return Date.now() - loadedAt < 5000;
  }

  private clearReadCaches() {
    this.analyticsCache = null;
    this.notificationsCache.clear();
  }

  async sendEmail(input: Record<string, unknown>) {
    const campaignId = cleanString(input.campaignId) || null;
    const memberId = cleanString(input.memberId) || null;
    const email = cleanString(input.email) || null;
    if (!campaignId && !memberId && !email) {
      throw new BadRequestException("campaignId, memberId, or email is required.");
    }

    return this.runtime.update((state) => {
      const notification = {
        id: `email-${Date.now()}`,
        type: "email",
        channel: "email",
        status: "queued",
        campaignId,
        memberId,
        email,
        subject: cleanString(input.subject) || "Loyalty update",
        message: cleanString(input.message) || "You have a loyalty update.",
        read: false,
        createdAt: nowIso(),
      };
      state.notifications.unshift(notification);
      this.clearReadCaches();
      return notification;
    });
  }

  async sendSms(input: Record<string, unknown>) {
    const memberId = cleanString(input.memberId) || null;
    const message = cleanString(input.message);
    if (!memberId && !cleanString(input.phone)) throw new BadRequestException("memberId or phone is required.");
    if (!message) throw new BadRequestException("message is required.");

    return this.runtime.update((state) => {
      const notification = {
        id: `sms-${Date.now()}`,
        type: "sms",
        channel: "sms",
        status: "queued",
        memberId,
        phone: cleanString(input.phone) || null,
        message,
        read: false,
        createdAt: nowIso(),
      };
      state.notifications.unshift(notification);
      this.clearReadCaches();
      return notification;
    });
  }

  async analytics() {
    if (this.analyticsCache && this.isFresh(this.analyticsCache.loadedAt)) {
      return this.analyticsCache.value;
    }

    const state = await this.runtime.read();
    const notifications = state.notifications || [];
    const email = notifications.filter((row) => row.channel === "email" || row.type === "email");
    const sms = notifications.filter((row) => row.channel === "sms" || row.type === "sms");
    const sent = notifications.filter((row) => row.status === "sent" || row.status === "read").length;
    const queued = notifications.filter((row) => row.status === "queued" || row.status === "pending").length;
    const failed = notifications.filter((row) => row.status === "failed").length;

    const value = {
      total: notifications.length,
      byChannel: {
        email: email.length,
        sms: sms.length,
      },
      byStatus: {
        sent,
        queued,
        failed,
        read: notifications.filter((row) => row.status === "read").length,
      },
      recent: notifications.slice(0, 10),
      totalMessages: notifications.length,
      emailMessages: email.length,
      smsMessages: sms.length,
      sent,
      queued,
      failed,
      openRate: email.length ? 0 : 0,
      clickRate: email.length ? 0 : 0,
      optOutCount: Object.values(state.communicationPreferences).filter((row) => row.email === false || row.sms === false).length,
      recentMessages: notifications.slice(0, 10),
      source: "local_runtime",
    };
    this.analyticsCache = { loadedAt: Date.now(), value };
    return value;
  }

  async notifications(input: { memberId?: string; email?: string; limit?: number }) {
    const limit = Math.min(100, Math.max(1, Number(input.limit || 20)));
    const memberId = cleanString(input.memberId);
    const email = cleanString(input.email).toLowerCase();
    const cacheKey = JSON.stringify({ memberId, email, limit });
    const cached = this.notificationsCache.get(cacheKey);
    if (cached && this.isFresh(cached.loadedAt)) {
      return cached.value;
    }

    const state = await this.runtime.read();
    const value = (state.notifications || [])
      .filter((row) => {
        if (!memberId && !email) return true;
        const rowMemberId = cleanString(row.memberId);
        const recipient = cleanString(row.email || row.phone || row.recipient).toLowerCase();
        return Boolean((memberId && rowMemberId === memberId) || (email && recipient === email));
      })
      .slice(0, limit)
      .map((row) => ({
        id: cleanString(row.id) || `notification-${Date.now()}`,
        type: cleanString(row.type || row.channel) || "notification",
        channel: cleanString(row.channel || row.type) || "email",
        subject: cleanString(row.subject) || "Notification",
        message: cleanString(row.message) || "You have a loyalty update.",
        status: cleanString(row.status) || "queued",
        read: Boolean(row.read || row.status === "read"),
        createdAt: cleanString(row.createdAt) || cleanString(row.created_at) || new Date().toISOString(),
      }));

    this.notificationsCache.set(cacheKey, { loadedAt: Date.now(), value });
    return value;
  }

  async markRead(id: string) {
    return this.runtime.update((state) => {
      const notification = (state.notifications || []).find((row) => cleanString(row.id) === id);
      if (!notification) return { id, status: "read", missing: true };
      notification.status = "read";
      notification.read = true;
      notification.readAt = nowIso();
      this.clearReadCaches();
      return notification;
    });
  }

  async unsubscribe(input: Record<string, unknown>) {
    const memberId = cleanString(input.memberId) || cleanString(input.email);
    if (!memberId) throw new BadRequestException("memberId or email is required.");
    return this.runtime.update((state) => {
      const current = state.communicationPreferences[memberId] || {};
      const preferences = {
        ...current,
        email: false,
        sms: false,
        promotionalOptIn: false,
        unsubscribedAt: nowIso(),
      };
      state.communicationPreferences[memberId] = preferences;
      this.clearReadCaches();
      return preferences;
    });
  }
}
