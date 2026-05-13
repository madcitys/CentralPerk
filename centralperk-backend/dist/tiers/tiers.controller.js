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
exports.TiersController = void 0;
const common_1 = require("@nestjs/common");
const tiers_service_1 = require("./tiers.service");
let TiersController = class TiersController {
    tiers;
    constructor(tiers) {
        this.tiers = tiers;
    }
    async list() {
        return { ok: true, tiers: await this.tiers.listTiers() };
    }
};
exports.TiersController = TiersController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TiersController.prototype, "list", null);
exports.TiersController = TiersController = __decorate([
    (0, common_1.Controller)("tiers"),
    __metadata("design:paramtypes", [tiers_service_1.TiersService])
], TiersController);
//# sourceMappingURL=tiers.controller.js.map