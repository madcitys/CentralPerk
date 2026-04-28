import { BadRequestException, Injectable } from "@nestjs/common";
import { LocalRuntimeService } from "../local-runtime/local-runtime.service";
import { cleanString, nowIso } from "../common/utils";

@Injectable()
export class CommunicationsService {
  constructor(private readonly runtime: LocalRuntimeService) {}

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
      return notification;
    });
  }

  async analytics() {
    const state = await this.runtime.read();
    const notifications = state.notifications || [];
    const email = notifications.filter((row) => row.channel === "email" || row.type === "email");
    const sms = notifications.filter((row) => row.channel === "sms" || row.type === "sms");
    const sent = notifications.filter((row) => row.status === "sent" || row.status === "read").length;
    const queued = notifications.filter((row) => row.status === "queued" || row.status === "pending").length;
    const failed = notifications.filter((row) => row.status === "failed").length;

    return {
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
      return preferences;
    });
  }
}
