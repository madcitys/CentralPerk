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
exports.PartnersController = void 0;
const common_1 = require("@nestjs/common");
const partners_service_1 = require("./partners.service");
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
let PartnersController = class PartnersController {
    partners;
    constructor(partners) {
        this.partners = partners;
    }
    async transaction(body, request) {
        return { ok: true, transaction: await this.partners.createTransaction(merge(body, request)) };
    }
    async dashboard() {
        const partners = await this.partners.dashboard();
        return { ok: true, partners, source: "local_runtime" };
    }
    async dashboardById(id) {
        return { ok: true, dashboard: await this.partners.dashboardById(id), source: "local_runtime" };
    }
    async settlement(body, request) {
        return { ok: true, settlement: await this.partners.createSettlement(merge(body, request)) };
    }
    async settlementByPartner(id, body, request) {
        return { ok: true, settlement: await this.partners.createSettlement({ ...merge(body, request), partnerId: id }) };
    }
    async pdf(id, response) {
        const pdf = await this.partners.settlementPdf(id);
        response.setHeader("Content-Type", "application/pdf");
        response.setHeader("Content-Disposition", `inline; filename="${id}.pdf"`);
        response.send(pdf);
    }
    async pdfByPartnerMonth(id, month, response) {
        const settlement = await this.partners.findSettlementByPartnerMonth(id, month);
        const pdf = await this.partners.settlementPdf(String(settlement.id));
        response.setHeader("Content-Type", "application/pdf");
        response.setHeader("Content-Disposition", `inline; filename="${id}-${month}.pdf"`);
        response.send(pdf);
    }
    async paid(id) {
        return { ok: true, settlement: await this.partners.markPaid(id) };
    }
    async status(id, body) {
        return { ok: true, partner: await this.partners.setStatus(id, body?.isActive !== false) };
    }
    async paidByPartnerMonth(id, month) {
        const settlement = await this.partners.findSettlementByPartnerMonth(id, month);
        return { ok: true, settlement: await this.partners.markPaid(String(settlement.id)) };
    }
};
exports.PartnersController = PartnersController;
__decorate([
    (0, common_1.Post)("transactions"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.PartnerTransactionDto, Object]),
    __metadata("design:returntype", Promise)
], PartnersController.prototype, "transaction", null);
__decorate([
    (0, common_1.Get)("dashboard"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PartnersController.prototype, "dashboard", null);
__decorate([
    (0, common_1.Get)(":id/dashboard"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PartnersController.prototype, "dashboardById", null);
__decorate([
    (0, common_1.Post)("settlements"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.PartnerSettlementDto, Object]),
    __metadata("design:returntype", Promise)
], PartnersController.prototype, "settlement", null);
__decorate([
    (0, common_1.Post)(":id/settlement"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.PartnerSettlementDto, Object]),
    __metadata("design:returntype", Promise)
], PartnersController.prototype, "settlementByPartner", null);
__decorate([
    (0, common_1.Get)("settlements/:id/pdf"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PartnersController.prototype, "pdf", null);
__decorate([
    (0, common_1.Get)(":id/settlement/:month/pdf"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Param)("month")),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], PartnersController.prototype, "pdfByPartnerMonth", null);
__decorate([
    (0, common_1.Patch)("settlements/:id/paid"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PartnersController.prototype, "paid", null);
__decorate([
    (0, common_1.Patch)(":id/status"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PartnersController.prototype, "status", null);
__decorate([
    (0, common_1.Patch)(":id/settlement/:month/paid"),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Param)("month")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], PartnersController.prototype, "paidByPartnerMonth", null);
exports.PartnersController = PartnersController = __decorate([
    (0, common_1.Controller)("partners"),
    __metadata("design:paramtypes", [partners_service_1.PartnersService])
], PartnersController);
//# sourceMappingURL=partners.controller.js.map