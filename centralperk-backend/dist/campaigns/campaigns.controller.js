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
exports.CampaignsController = void 0;
const common_1 = require("@nestjs/common");
const campaigns_service_1 = require("./campaigns.service");
let CampaignsController = class CampaignsController {
    campaigns;
    constructor(campaigns) {
        this.campaigns = campaigns;
    }
    async create(body, query) {
        const campaign = await this.campaigns.create({ ...query, ...body });
        return { ok: true, campaign, campaignId: campaign.id };
    }
    async list() {
        return { ok: true, campaigns: await this.campaigns.list(), source: "local_runtime" };
    }
    async active(tier) {
        return { ok: true, campaigns: await this.campaigns.active(tier) };
    }
    async performance() {
        return { ok: true, performance: await this.campaigns.performance(), source: "local_runtime" };
    }
    async get(id) {
        const campaign = await this.campaigns.get(id);
        return { ok: true, campaign, campaignId: campaign.id };
    }
    async publish(id) {
        const campaign = await this.campaigns.publish(id);
        return { ok: true, campaign, campaignId: campaign.id, notificationsQueued: 0 };
    }
    async budget(id) {
        const campaign = await this.campaigns.get(id);
        return { ok: true, budgetStatus: this.campaigns.budgetStatus(campaign), campaignId: campaign.id };
    }
};
exports.CampaignsController = CampaignsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)("active"),
    __param(0, (0, common_1.Query)("tier")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "active", null);
__decorate([
    (0, common_1.Get)("performance"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "performance", null);
__decorate([
    (0, common_1.Get)(":id"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "get", null);
__decorate([
    (0, common_1.Patch)(":id/publish"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "publish", null);
__decorate([
    (0, common_1.Get)(":id/budget-status"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "budget", null);
exports.CampaignsController = CampaignsController = __decorate([
    (0, common_1.Controller)("campaigns"),
    __metadata("design:paramtypes", [campaigns_service_1.CampaignsService])
], CampaignsController);
//# sourceMappingURL=campaigns.controller.js.map