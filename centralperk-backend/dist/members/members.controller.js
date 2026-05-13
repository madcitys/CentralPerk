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
exports.MembersController = void 0;
const common_1 = require("@nestjs/common");
const members_service_1 = require("./members.service");
let MembersController = class MembersController {
    members;
    constructor(members) {
        this.members = members;
    }
    async list(limit, email) {
        return {
            ok: true,
            members: await this.members.list(Math.min(500, Math.max(1, Number(limit || 100))), email),
        };
    }
    async get(id, email) {
        return { ok: true, member: await this.members.get(id, email) };
    }
    async profile(id, email) {
        return { ok: true, memberId: id, profile: await this.members.profile(id, email) };
    }
    async tier(id, email) {
        return { ok: true, memberId: id, tier: await this.members.tier(id, email) };
    }
    async notifications(id, limit) {
        return {
            ok: true,
            memberId: id,
            notifications: await this.members.notifications(id, Math.min(100, Math.max(1, Number(limit || 20)))),
        };
    }
    async preferences(id, body) {
        return { ok: true, memberId: id, preference: await this.members.preferences(id, body || {}) };
    }
};
exports.MembersController = MembersController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)("limit")),
    __param(1, (0, common_1.Query)("email")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MembersController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(":id"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Query)("email")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MembersController.prototype, "get", null);
__decorate([
    (0, common_1.Get)(":id/profile"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Query)("email")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MembersController.prototype, "profile", null);
__decorate([
    (0, common_1.Get)(":id/tier"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Query)("email")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MembersController.prototype, "tier", null);
__decorate([
    (0, common_1.Get)(":id/notifications"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Query)("limit")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MembersController.prototype, "notifications", null);
__decorate([
    (0, common_1.Patch)(":id/preferences"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MembersController.prototype, "preferences", null);
exports.MembersController = MembersController = __decorate([
    (0, common_1.Controller)("members"),
    __metadata("design:paramtypes", [members_service_1.MembersService])
], MembersController);
//# sourceMappingURL=members.controller.js.map