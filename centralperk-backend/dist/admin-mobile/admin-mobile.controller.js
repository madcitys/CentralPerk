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
exports.AdminMobileController = void 0;
const common_1 = require("@nestjs/common");
const admin_mobile_service_1 = require("./admin-mobile.service");
let AdminMobileController = class AdminMobileController {
    adminMobile;
    constructor(adminMobile) {
        this.adminMobile = adminMobile;
    }
    async pointsSnapshot() {
        return this.adminMobile.pointsSnapshot();
    }
    async mobileSummary(from, to) {
        return this.adminMobile.mobileSummary(from, to);
    }
    async engagementSummary() {
        return this.adminMobile.engagementSummary();
    }
    async notificationCampaigns() {
        return this.adminMobile.notificationCampaigns();
    }
    async createNotificationCampaign(body) {
        return this.adminMobile.createNotificationCampaign(body || {});
    }
    async launchNotificationCampaign(id) {
        return this.adminMobile.launchNotificationCampaign(id);
    }
    async surveys() {
        return this.adminMobile.surveys();
    }
    async createSurvey(body) {
        return this.adminMobile.createSurvey(body || {});
    }
    async winBackCampaigns() {
        return this.adminMobile.winBackCampaigns();
    }
    async createWinBackCampaign(body) {
        return this.adminMobile.createWinBackCampaign(body || {});
    }
    async settings() {
        return this.adminMobile.settings();
    }
    async updateSettings(body) {
        return this.adminMobile.updateSettings(body || {});
    }
};
exports.AdminMobileController = AdminMobileController;
__decorate([
    (0, common_1.Get)("points/snapshot"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminMobileController.prototype, "pointsSnapshot", null);
__decorate([
    (0, common_1.Get)("analytics/mobile-summary"),
    __param(0, (0, common_1.Query)("from")),
    __param(1, (0, common_1.Query)("to")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AdminMobileController.prototype, "mobileSummary", null);
__decorate([
    (0, common_1.Get)("engagement/summary"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminMobileController.prototype, "engagementSummary", null);
__decorate([
    (0, common_1.Get)("engagement/notification-campaigns"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminMobileController.prototype, "notificationCampaigns", null);
__decorate([
    (0, common_1.Post)("engagement/notification-campaigns"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminMobileController.prototype, "createNotificationCampaign", null);
__decorate([
    (0, common_1.Patch)("engagement/notification-campaigns/:id/launch"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminMobileController.prototype, "launchNotificationCampaign", null);
__decorate([
    (0, common_1.Get)("engagement/surveys"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminMobileController.prototype, "surveys", null);
__decorate([
    (0, common_1.Post)("engagement/surveys"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminMobileController.prototype, "createSurvey", null);
__decorate([
    (0, common_1.Get)("engagement/win-back-campaigns"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminMobileController.prototype, "winBackCampaigns", null);
__decorate([
    (0, common_1.Post)("engagement/win-back-campaigns"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminMobileController.prototype, "createWinBackCampaign", null);
__decorate([
    (0, common_1.Get)("settings/admin"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminMobileController.prototype, "settings", null);
__decorate([
    (0, common_1.Patch)("settings/admin"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminMobileController.prototype, "updateSettings", null);
exports.AdminMobileController = AdminMobileController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [admin_mobile_service_1.AdminMobileService])
], AdminMobileController);
//# sourceMappingURL=admin-mobile.controller.js.map