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
exports.PointsController = void 0;
const common_1 = require("@nestjs/common");
const points_service_1 = require("./points.service");
const dto_1 = require("./dto");
function mergePayload(body, request) {
    const query = Object.fromEntries(new URLSearchParams(String(request.originalUrl || request.url || "").split("?")[1] || ""));
    const payload = { ...query, ...(request.query || {}) };
    for (const [key, value] of Object.entries(body || {})) {
        if (value !== undefined && value !== null && value !== "")
            payload[key] = value;
    }
    return payload;
}
function resolveLookupInput(memberId, email) {
    const normalizedMemberId = String(memberId || "").trim();
    const normalizedEmail = String(email || "").trim();
    return {
        memberIdentifier: normalizedMemberId || normalizedEmail,
        email: normalizedEmail || undefined,
    };
}
let PointsController = class PointsController {
    points;
    constructor(points) {
        this.points = points;
    }
    async award(body, request, idempotencyKey) {
        const result = await this.points.award(mergePayload(body, request), idempotencyKey);
        return { ok: true, result };
    }
    async redeem(body, request) {
        const result = await this.points.redeem(mergePayload(body, request));
        return { ok: true, result };
    }
    async pointsForMember(id, email) {
        const activity = await this.points.activity(id, email);
        return {
            ok: true,
            memberId: activity.balance.member_id,
            points: activity.balance.points_balance,
            balance: activity.balance,
        };
    }
    async history(id, email) {
        const activity = await this.points.activity(id, email);
        return { ok: true, memberId: activity.balance.member_id, history: activity.history.slice(0, 200) };
    }
    async pointsLookup(memberId, email) {
        const lookup = resolveLookupInput(memberId, email);
        const activity = email && !lookup.memberIdentifier ? await this.points.lookupByEmail(email) : await this.points.activity(lookup.memberIdentifier, lookup.email);
        return {
            ok: true,
            memberId: activity.balance.member_id,
            points: activity.balance.points_balance,
            balance: activity.balance,
        };
    }
    async pointsHistoryLookup(memberId, email) {
        const lookup = resolveLookupInput(memberId, email);
        const activity = email && !lookup.memberIdentifier ? await this.points.lookupByEmail(email) : await this.points.activity(lookup.memberIdentifier, lookup.email);
        return { ok: true, memberId: activity.balance.member_id, history: activity.history.slice(0, 200) };
    }
};
exports.PointsController = PointsController;
__decorate([
    (0, common_1.Post)("points/award"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Headers)("idempotency-key")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.AwardPointsDto, Object, String]),
    __metadata("design:returntype", Promise)
], PointsController.prototype, "award", null);
__decorate([
    (0, common_1.Post)("points/redeem"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.RedeemPointsDto, Object]),
    __metadata("design:returntype", Promise)
], PointsController.prototype, "redeem", null);
__decorate([
    (0, common_1.Get)("members/:id/points"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Query)("email")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], PointsController.prototype, "pointsForMember", null);
__decorate([
    (0, common_1.Get)("members/:id/points-history"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Query)("email")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], PointsController.prototype, "history", null);
__decorate([
    (0, common_1.Get)("points"),
    __param(0, (0, common_1.Query)("memberId")),
    __param(1, (0, common_1.Query)("email")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], PointsController.prototype, "pointsLookup", null);
__decorate([
    (0, common_1.Get)("points-history"),
    __param(0, (0, common_1.Query)("memberId")),
    __param(1, (0, common_1.Query)("email")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], PointsController.prototype, "pointsHistoryLookup", null);
exports.PointsController = PointsController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [points_service_1.PointsService])
], PointsController);
//# sourceMappingURL=points.controller.js.map