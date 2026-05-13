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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommunicationsController = void 0;
const common_1 = require("@nestjs/common");
const communications_service_1 = require("./communications.service");
const dto_1 = require("./dto");
function merge(body, request) {
    const query = Object.fromEntries(new URLSearchParams(String(request.originalUrl || request.url || "").split("?")[1] || ""));
    const payload = { ...query, ...(request.query || {}) };
    for (const [key, value] of Object.entries(body || {})) {
        if (value !== undefined && value !== null && value !== "")
            payload[key] = value;
    }
    return payload;
}
let CommunicationsController = class CommunicationsController {
    communications;
    constructor(communications) {
        this.communications = communications;
    }
    async email(body, request) {
        return { ok: true, result: await this.communications.sendEmail(merge(body, request)) };
    }
    async sms(body, request) {
        return { ok: true, result: await this.communications.sendSms(merge(body, request)) };
    }
    async notifications(memberId, email, limit) {
        return {
            ok: true,
            notifications: await this.communications.notifications({
                memberId,
                email,
                limit: Number(limit || 20),
            }),
        };
    }
    async read(id) {
        return { ok: true, notification: await this.communications.markRead(id) };
    }
    async analytics() {
        return { ok: true, analytics: await this.communications.analytics() };
    }
    async unsubscribe(body, request) {
        return { ok: true, preferences: await this.communications.unsubscribe(merge(body, request)) };
    }
};
exports.CommunicationsController = CommunicationsController;
__decorate([
    (0, common_1.Post)("communications/email"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.SendEmailDto, Object]),
    __metadata("design:returntype", Promise)
], CommunicationsController.prototype, "email", null);
__decorate([
    (0, common_1.Post)("notifications/sms"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.SendSmsDto, Object]),
    __metadata("design:returntype", Promise)
], CommunicationsController.prototype, "sms", null);
__decorate([
    (0, common_1.Get)("notifications"),
    __param(0, (0, common_1.Query)("memberId")),
    __param(1, (0, common_1.Query)("email")),
    __param(2, (0, common_1.Query)("limit")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], CommunicationsController.prototype, "notifications", null);
__decorate([
    (0, common_1.Patch)("notifications/:id/read"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CommunicationsController.prototype, "read", null);
__decorate([
    (0, common_1.Get)("communications/analytics"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CommunicationsController.prototype, "analytics", null);
__decorate([
    (0, common_1.Post)("unsubscribe"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.UnsubscribeDto, Object]),
    __metadata("design:returntype", Promise)
], CommunicationsController.prototype, "unsubscribe", null);
exports.CommunicationsController = CommunicationsController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [communications_service_1.CommunicationsService])
], CommunicationsController);
//# sourceMappingURL=communications.controller.js.map