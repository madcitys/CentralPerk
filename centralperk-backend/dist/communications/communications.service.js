"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommunicationsService = void 0;
const common_1 = require("@nestjs/common");
const local_runtime_service_1 = require("../local-runtime/local-runtime.service");
const utils_1 = require("../common/utils");
let CommunicationsService = class CommunicationsService {
    runtime;
    analyticsCache = null;
    notificationsCache = new Map();
    constructor(runtime) {
        this.runtime = runtime;
    }
    isFresh(loadedAt) {
        return Date.now() - loadedAt < 5000;
    }
    clearReadCaches() {
        this.analyticsCache = null;
        this.notificationsCache.clear();
    }
    async sendEmail(input) {
        const campaignId = (0, utils_1.cleanString)(input.campaignId) || null;
        const memberId = (0, utils_1.cleanString)(input.memberId) || null;
        const email = (0, utils_1.cleanString)(input.email) || null;
        if (!campaignId && !memberId && !email) {
            throw new common_1.BadRequestException("campaignId, memberId, or email is required.");
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
                subject: (0, utils_1.cleanString)(input.subject) || "Loyalty update",
                message: (0, utils_1.cleanString)(input.message) || "You have a loyalty update.",
                read: false,
                createdAt: (0, utils_1.nowIso)(),
            };
            state.notifications.unshift(notification);
            this.clearReadCaches();
            return notification;
        });
    }
    async sendSms(input) {
        const memberId = (0, utils_1.cleanString)(input.memberId) || null;
        const message = (0, utils_1.cleanString)(input.message);
        if (!memberId && !(0, utils_1.cleanString)(input.phone))
            throw new common_1.BadRequestException("memberId or phone is required.");
        if (!message)
            throw new common_1.BadRequestException("message is required.");
        return this.runtime.update((state) => {
            const notification = {
                id: `sms-${Date.now()}`,
                type: "sms",
                channel: "sms",
                status: "queued",
                memberId,
                phone: (0, utils_1.cleanString)(input.phone) || null,
                message,
                read: false,
                createdAt: (0, utils_1.nowIso)(),
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
    async notifications(input) {
        const limit = Math.min(100, Math.max(1, Number(input.limit || 20)));
        const memberId = (0, utils_1.cleanString)(input.memberId);
        const email = (0, utils_1.cleanString)(input.email).toLowerCase();
        const cacheKey = JSON.stringify({ memberId, email, limit });
        const cached = this.notificationsCache.get(cacheKey);
        if (cached && this.isFresh(cached.loadedAt)) {
            return cached.value;
        }
        const state = await this.runtime.read();
        const value = (state.notifications || [])
            .filter((row) => {
            if (!memberId && !email)
                return true;
            const rowMemberId = (0, utils_1.cleanString)(row.memberId);
            const recipient = (0, utils_1.cleanString)(row.email || row.phone || row.recipient).toLowerCase();
            return Boolean((memberId && rowMemberId === memberId) || (email && recipient === email));
        })
            .slice(0, limit)
            .map((row) => ({
            id: (0, utils_1.cleanString)(row.id) || `notification-${Date.now()}`,
            type: (0, utils_1.cleanString)(row.type || row.channel) || "notification",
            channel: (0, utils_1.cleanString)(row.channel || row.type) || "email",
            subject: (0, utils_1.cleanString)(row.subject) || "Notification",
            message: (0, utils_1.cleanString)(row.message) || "You have a loyalty update.",
            status: (0, utils_1.cleanString)(row.status) || "queued",
            read: Boolean(row.read || row.status === "read"),
            createdAt: (0, utils_1.cleanString)(row.createdAt) || (0, utils_1.cleanString)(row.created_at) || new Date().toISOString(),
        }));
        this.notificationsCache.set(cacheKey, { loadedAt: Date.now(), value });
        return value;
    }
    async markRead(id) {
        return this.runtime.update((state) => {
            const notification = (state.notifications || []).find((row) => (0, utils_1.cleanString)(row.id) === id);
            if (!notification)
                return { id, status: "read", missing: true };
            notification.status = "read";
            notification.read = true;
            notification.readAt = (0, utils_1.nowIso)();
            this.clearReadCaches();
            return notification;
        });
    }
    async unsubscribe(input) {
        const memberId = (0, utils_1.cleanString)(input.memberId) || (0, utils_1.cleanString)(input.email);
        if (!memberId)
            throw new common_1.BadRequestException("memberId or email is required.");
        return this.runtime.update((state) => {
            const current = state.communicationPreferences[memberId] || {};
            const preferences = {
                ...current,
                email: false,
                sms: false,
                promotionalOptIn: false,
                unsubscribedAt: (0, utils_1.nowIso)(),
            };
            state.communicationPreferences[memberId] = preferences;
            this.clearReadCaches();
            return preferences;
        });
    }
};
exports.CommunicationsService = CommunicationsService;
exports.CommunicationsService = CommunicationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [local_runtime_service_1.LocalRuntimeService])
], CommunicationsService);
//# sourceMappingURL=communications.service.js.map