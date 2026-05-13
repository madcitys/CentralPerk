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
exports.RewardsController = void 0;
const common_1 = require("@nestjs/common");
const rewards_service_1 = require("./rewards.service");
const points_service_1 = require("../points/points.service");
let RewardsController = class RewardsController {
    rewards;
    points;
    constructor(rewards, points) {
        this.rewards = rewards;
        this.points = points;
    }
    async list() {
        return { ok: true, rewards: await this.rewards.list(), source: "local_runtime" };
    }
    async active(tier) {
        return { ok: true, rewards: await this.rewards.active(tier), source: "local_runtime" };
    }
    async get(id) {
        return { ok: true, reward: await this.rewards.get(id) };
    }
    async redeem(body) {
        const rewardId = body.rewardCatalogId ? String(body.rewardCatalogId) : body.rewardId ? String(body.rewardId) : null;
        const reward = rewardId ? await this.rewards.get(rewardId).catch(() => null) : null;
        const result = await this.points.redeem({
            memberIdentifier: String(body.memberIdentifier || body.memberId || body.email || ""),
            fallbackEmail: body.email ? String(body.email) : undefined,
            points: Number(body.points || body.pointsCost || reward?.pointsCost || 0),
            reason: body.reason ? String(body.reason) : "Reward redemption",
            transactionType: body.transactionType ? String(body.transactionType) : "REDEEM",
            rewardCatalogId: rewardId || undefined,
        });
        return { ok: true, result };
    }
};
exports.RewardsController = RewardsController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RewardsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)("active"),
    __param(0, (0, common_1.Query)("tier")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RewardsController.prototype, "active", null);
__decorate([
    (0, common_1.Get)(":id"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RewardsController.prototype, "get", null);
__decorate([
    (0, common_1.Post)("redeem"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RewardsController.prototype, "redeem", null);
exports.RewardsController = RewardsController = __decorate([
    (0, common_1.Controller)("rewards"),
    __metadata("design:paramtypes", [rewards_service_1.RewardsService,
        points_service_1.PointsService])
], RewardsController);
//# sourceMappingURL=rewards.controller.js.map