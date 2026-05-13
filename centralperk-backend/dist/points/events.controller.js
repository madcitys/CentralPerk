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
exports.EventsController = void 0;
const common_1 = require("@nestjs/common");
const points_service_1 = require("./points.service");
const dto_1 = require("./dto");
let EventsController = class EventsController {
    points;
    constructor(points) {
        this.points = points;
    }
    async transactionCompleted(body) {
        const result = await this.points.award({
            memberIdentifier: body.memberIdentifier,
            fallbackEmail: body.fallbackEmail,
            amountSpent: body.amountSpent,
            transactionType: "PURCHASE",
            transactionRef: body.transactionReference,
            reason: body.reason || "POS transaction completed",
        }, body.transactionReference);
        return { ok: true, result };
    }
};
exports.EventsController = EventsController;
__decorate([
    (0, common_1.Post)("transaction-completed"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.TransactionCompletedDto]),
    __metadata("design:returntype", Promise)
], EventsController.prototype, "transactionCompleted", null);
exports.EventsController = EventsController = __decorate([
    (0, common_1.Controller)("events"),
    __metadata("design:paramtypes", [points_service_1.PointsService])
], EventsController);
//# sourceMappingURL=events.controller.js.map