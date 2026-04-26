import { BadRequestException, Injectable } from "@nestjs/common";
import { LocalRuntimeService } from "../local-runtime/local-runtime.service";
import { cleanString, nowIso } from "../common/utils";

type OutboxMessage = {
  id: string;
  type: "email" | "sms" | "referral";
  channel: "email" | "sms";
  status: "queued" | "sent" | "failed" | "demo";
  mode: "demo" | "provider";
  memberId: string | null;
  recipient: string | null;
  subject?: string | null;
  message: string;
  createdAt: string;
  campaignId?: string | null;
  referralId?: string | null;
  read?: boolean;
};

const READ_CACHE_TTL_MS = 5_000;

type OutboxEntry = {
  id: string;
  type: string;
  channel: string;
  recipient: string | null;
  subject: string | null;
  message: string;
  status: string;
  mode: string;
  memberId: string | null;
  createdAt: string;
  campaignId: string | null;
};

type NotificationSummary = {
  id: string;
  subject: string;
  message: string;
  createdAt: string;
  status: string;
};

type CommunicationsAnalytics = {
  totalMessages: number;
  emailMessages: number;
  smsMessages: number;
  sent: number;
  queued: number;
  failed: number;
  openRate: number;
  clickRate: number;
  optOutCount: number;
  recentMessages: Array<Record<string, unknown>>;
  source: "local_runtime";
};

@Injectable()
export class CommunicationsService {
  private outboxCache = new Map<string, { loadedAt: number; value: OutboxEntry[] }>();
  private notificationsCache = new Map<string, { loadedAt: number; value: NotificationSummary[] }>();
  private analyticsCache: { loadedAt: number; value: CommunicationsAnalytics } | null = null;

  constructor(private readonly runtime: LocalRuntimeService) {}

  private providerMode() {
    const emailProvider = cleanString(process.env.EMAIL_PROVIDER).toLowerCase();
    const smsProvider = cleanString(process.env.SMS_PROVIDER).toLowerCase();
    return (
      (emailProvider && emailProvider !== "demo") ||
      (smsProvider && smsProvider !== "demo")
    )
      ? "provider"
      : "demo";
  }

  mode() {
    return this.providerMode();
  }

  private isFresh(loadedAt: number) {
    return Date.now() - loadedAt < READ_CACHE_TTL_MS;
  }

  private clearReadCaches() {
    this.outboxCache.clear();
    this.notificationsCache.clear();
    this.analyticsCache = null;
  }

  private queueMessage(state: { notifications: Array<Record<string, unknown>> }, payload: OutboxMessage) {
    state.notifications.unshift(payload);
    return payload;
  }

  async sendEmail(input: Record<string, unknown>) {
    const campaignId = cleanString(input.campaignId) || null;
    const memberId = cleanString(input.memberId) || null;
    const email = cleanString(input.email) || null;
    if (!campaignId && !memberId && !email) {
      throw new BadRequestException("campaignId, memberId, or email is required.");
    }

    const mode = this.providerMode();
    return this.runtime.update((state) => {
      const notification = this.queueMessage(state, {
        id: `email-${Date.now()}`,
        type: "email",
        channel: "email",
        status: mode === "demo" ? "demo" : "queued",
        mode,
        campaignId,
        memberId,
        recipient: email,
        subject: cleanString(input.subject) || "Loyalty update",
        message: cleanString(input.message) || "You have a loyalty update.",
        read: false,
        createdAt: nowIso(),
      });
      this.clearReadCaches();
      return {
        ...notification,
        ok: true,
        mode,
        message: mode === "demo" ? "Demo notification queued" : "Email queued",
      };
    });
  }

  async sendSms(input: Record<string, unknown>) {
    const memberId = cleanString(input.memberId) || null;
    const message = cleanString(input.message);
    if (!memberId && !cleanString(input.phone)) throw new BadRequestException("memberId or phone is required.");
    if (!message) throw new BadRequestException("message is required.");

    const mode = this.providerMode();
    return this.runtime.update((state) => {
      const notification = this.queueMessage(state, {
        id: `sms-${Date.now()}`,
        type: "sms",
        channel: "sms",
        status: mode === "demo" ? "demo" : "queued",
        mode,
        memberId,
        recipient: cleanString(input.phone) || null,
        message,
        read: false,
        createdAt: nowIso(),
      });
      this.clearReadCaches();
      return {
        ...notification,
        ok: true,
        mode,
        message: mode === "demo" ? "Demo notification queued" : "SMS queued",
      };
    });
  }

  async outbox(limit = 100): Promise<OutboxEntry[]> {
    const cacheKey = String(limit);
    const cached = this.outboxCache.get(cacheKey);
    if (cached && this.isFresh(cached.loadedAt)) {
      return cached.value;
    }

    const state = await this.runtime.read();
    const value = (state.notifications || []).slice(0, limit).map(
      (entry): OutboxEntry => ({
        id: String(entry.id || ""),
        type: String(entry.type || entry.channel || "email"),
        channel: String(entry.channel || entry.type || "email"),
        recipient: entry.recipient ? String(entry.recipient) : entry.email ? String(entry.email) : entry.phone ? String(entry.phone) : null,
        subject: entry.subject ? String(entry.subject) : null,
        message: String(entry.message || ""),
        status: String(entry.status || "queued"),
        mode: String(entry.mode || "demo"),
        memberId: entry.memberId ? String(entry.memberId) : null,
        createdAt: String(entry.createdAt || nowIso()),
        campaignId: entry.campaignId ? String(entry.campaignId) : null,
      }),
    );
    this.outboxCache.set(cacheKey, { loadedAt: Date.now(), value });
    return value;
  }

  async notifications(input: { memberId?: string; email?: string; limit?: number }): Promise<NotificationSummary[]> {
    const limit = Math.min(100, Math.max(1, Number(input.limit || 20)));
    const memberId = cleanString(input.memberId);
    const email = cleanString(input.email).toLowerCase();
    const cacheKey = JSON.stringify({ memberId, email, limit });
    const cached = this.notificationsCache.get(cacheKey);
    if (cached && this.isFresh(cached.loadedAt)) {
      return cached.value;
    }

    const messages = await this.outbox(300);
    const value = messages
      .filter((entry) => {
        if (!memberId && !email) return true;
        const entryMemberId = cleanString(entry.memberId);
        const recipient = cleanString(entry.recipient).toLowerCase();
        return Boolean((memberId && entryMemberId === memberId) || (email && recipient === email));
      })
      .slice(0, limit)
      .map((entry) => ({
        id: entry.id,
        subject: entry.subject || "Notification",
        message: entry.message,
        createdAt: entry.createdAt,
        status: entry.status,
      }));
    this.notificationsCache.set(cacheKey, { loadedAt: Date.now(), value });
    return value;
  }

  async markRead(id: string) {
    return this.runtime.update((state) => {
      const notification = (state.notifications || []).find((entry) => String(entry.id) === id);
      if (!notification) return { id, status: "read", missing: true };
      notification.status = "read";
      notification.read = true;
      notification.readAt = nowIso();
      this.clearReadCaches();
      return notification;
    });
  }

  async analytics(): Promise<CommunicationsAnalytics> {
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

    const value: CommunicationsAnalytics = {
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
