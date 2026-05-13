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
exports.LocalRuntimeController = void 0;
const common_1 = require("@nestjs/common");
const local_runtime_service_1 = require("./local-runtime.service");
let LocalRuntimeController = class LocalRuntimeController {
    runtime;
    constructor(runtime) {
        this.runtime = runtime;
    }
    async points() {
        return {
            ok: true,
            source: "local_runtime",
            snapshot: {
                members: await this.runtime.snapshotPoints(),
            },
        };
    }
    async seed() {
        const state = await this.runtime.writeSeedFile();
        const pointsLedgerRows = Object.values(state.pointMembers || {}).reduce((sum, member) => sum + (Array.isArray(member.history) ? member.history.length : 0), 0);
        return {
            ok: true,
            source: "local_runtime",
            seeded: true,
            counts: {
                members: Object.keys(state.pointMembers || {}).length,
                rewards: Object.keys(state.rewards || {}).length,
                campaigns: Object.keys(state.campaigns || {}).length,
                segments: Object.keys(state.segments || {}).length,
                partners: Object.keys(state.partners || {}).length,
                notifications: (state.notifications || []).length,
                pointsLedgerRows,
                partnerTransactions: (state.partnerTransactions || []).length,
            },
        };
    }
};
exports.LocalRuntimeController = LocalRuntimeController;
__decorate([
    (0, common_1.Get)("points"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], LocalRuntimeController.prototype, "points", null);
__decorate([
    (0, common_1.Post)("seed"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], LocalRuntimeController.prototype, "seed", null);
exports.LocalRuntimeController = LocalRuntimeController = __decorate([
    (0, common_1.Controller)("local-runtime"),
    __metadata("design:paramtypes", [local_runtime_service_1.LocalRuntimeService])
], LocalRuntimeController);
//# sourceMappingURL=local-runtime.controller.js.map