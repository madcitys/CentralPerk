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
exports.PartnersService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const local_runtime_service_1 = require("../local-runtime/local-runtime.service");
const utils_1 = require("../common/utils");
let PartnersService = class PartnersService {
    runtime;
    constructor(runtime) {
        this.runtime = runtime;
    }
    async partnerCatalog() {
        const state = await this.runtime.read();
        return state.partners || {};
    }
    money(row) {
        return (0, utils_1.numberValue)(row.amount, (0, utils_1.numberValue)(row.grossAmount, (0, utils_1.numberValue)(row.totalGrossAmount, (0, utils_1.numberValue)(row.commissionAmount, 0))));
    }
    monthKey(value) {
        const text = (0, utils_1.cleanString)(value);
        return text || new Date().toISOString().slice(0, 7);
    }
    commissionForAmount(amount) {
        return Number((amount * 0.12).toFixed(2));
    }
    async resolvePartner(row) {
        const catalog = await this.partnerCatalog();
        const firstCatalogId = Object.keys(catalog)[0] || "";
        const partnerId = (0, utils_1.cleanString)(row.partnerId) || firstCatalogId || (0, utils_1.cleanString)(row.partnerCode);
        if (!partnerId)
            throw new common_1.BadRequestException("partnerId is required.");
        const existing = catalog[partnerId];
        return {
            id: existing?.id || partnerId,
            partnerCode: (0, utils_1.cleanString)(row.partnerCode) || (0, utils_1.cleanString)(existing?.partnerCode) || partnerId,
            partnerName: (0, utils_1.cleanString)(row.partnerName) || (0, utils_1.cleanString)(existing?.partnerName) || partnerId,
            description: existing?.description || null,
            logoUrl: existing?.logoUrl || null,
            conversionRate: (0, utils_1.numberValue)(existing?.conversionRate, 10),
            isActive: existing?.isActive !== false,
        };
    }
    async createTransaction(input) {
        const partnerId = (0, utils_1.cleanString)(input.partnerId);
        const memberId = (0, utils_1.cleanString)(input.memberId);
        if (!partnerId)
            throw new common_1.BadRequestException("partnerId is required.");
        if (!memberId)
            throw new common_1.BadRequestException("memberId is required.");
        const amount = (0, utils_1.numberValue)(input.grossAmount, (0, utils_1.numberValue)(input.amount, 0));
        if (amount <= 0)
            throw new common_1.BadRequestException("grossAmount must be greater than zero.");
        return this.runtime.update((state) => {
            return this.resolvePartner({
                partnerId,
                partnerCode: input.partnerCode,
                partnerName: input.partnerName,
            }).then((partner) => {
                const transaction = {
                    id: (0, utils_1.cleanString)(input.orderId) || `ptxn-${(0, crypto_1.randomUUID)()}`,
                    partnerId,
                    partnerCode: partner.partnerCode,
                    partnerName: partner.partnerName,
                    memberId,
                    amount,
                    grossAmount: amount,
                    points: Math.max(1, Math.floor((0, utils_1.numberValue)(input.points, amount / partner.conversionRate))),
                    status: "pending",
                    note: (0, utils_1.cleanString)(input.note) || null,
                    createdAt: (0, utils_1.nowIso)(),
                };
                state.partnerTransactions.unshift(transaction);
                return transaction;
            });
        });
    }
    async dashboard() {
        const state = await this.runtime.read();
        const catalog = await this.partnerCatalog();
        const groups = new Map();
        for (const row of state.partnerTransactions) {
            const partner = await this.resolvePartner(row);
            const entry = groups.get(partner.id) || { partner, transactions: [], settlements: [] };
            entry.transactions.push(row);
            groups.set(partner.id, entry);
        }
        for (const row of state.partnerSettlements) {
            const partner = await this.resolvePartner(row);
            const entry = groups.get(partner.id) || { partner, transactions: [], settlements: [] };
            entry.settlements.push(row);
            groups.set(partner.id, entry);
        }
        for (const partner of Object.values(catalog)) {
            if (!groups.has(partner.id)) {
                groups.set(partner.id, { partner, transactions: [], settlements: [] });
            }
        }
        return Array.from(groups.values())
            .map(({ partner, transactions, settlements }) => {
            const pendingTransactions = transactions.filter((row) => (0, utils_1.cleanString)(row.status) !== "settled").length;
            const settledTransactions = transactions.length - pendingTransactions;
            const points = transactions.reduce((sum, row) => sum + (0, utils_1.numberValue)(row.points, 0), 0);
            const grossAmount = transactions.reduce((sum, row) => sum + this.money(row), 0);
            const totalCommission = settlements.length
                ? settlements.reduce((sum, row) => sum + (0, utils_1.numberValue)(row.commissionAmount, this.commissionForAmount(this.money(row))), 0)
                : this.commissionForAmount(grossAmount);
            return {
                partner,
                totals: {
                    transactions: transactions.length,
                    pendingTransactions,
                    settledTransactions,
                    points,
                    grossAmount,
                    totalCommission,
                },
            };
        })
            .sort((left, right) => left.partner.partnerName.localeCompare(right.partner.partnerName));
    }
    async dashboardById(partnerId) {
        const state = await this.runtime.read();
        const partners = await this.dashboard();
        const row = partners.find((entry) => entry.partner.id === partnerId);
        if (!row)
            throw new common_1.NotFoundException("Partner not found.");
        return {
            partner: row.partner,
            totals: row.totals,
            settlements: state.partnerSettlements.filter((entry) => (0, utils_1.cleanString)(entry.partnerId) === partnerId),
            recentTransactions: state.partnerTransactions.filter((entry) => (0, utils_1.cleanString)(entry.partnerId) === partnerId).slice(0, 20),
        };
    }
    async createSettlement(input) {
        const partnerId = (0, utils_1.cleanString)(input.partnerId);
        if (!partnerId)
            throw new common_1.BadRequestException("partnerId is required.");
        const month = this.monthKey(input.month);
        return this.runtime.update((state) => {
            return this.resolvePartner({ partnerId }).then((partner) => {
                const transactionIds = state.partnerTransactions
                    .filter((row) => row.partnerId === partnerId && String(row.createdAt || "").startsWith(month))
                    .map((row) => row.id);
                const amount = state.partnerTransactions
                    .filter((row) => transactionIds.includes(String(row.id)))
                    .reduce((sum, row) => sum + this.money(row), 0);
                const existing = state.partnerSettlements.find((row) => row.partnerId === partnerId && row.month === month);
                const settlement = {
                    ...(existing || {}),
                    id: existing?.id || `set-${partnerId}-${month}`.replace(/[^a-zA-Z0-9-]/g, "-"),
                    partnerId,
                    partnerCode: partner.partnerCode,
                    partnerName: partner.partnerName,
                    month,
                    amount,
                    grossAmount: amount,
                    commissionAmount: this.commissionForAmount(amount),
                    transactionIds,
                    status: existing?.status || "pending",
                    createdAt: existing?.createdAt || (0, utils_1.nowIso)(),
                    updatedAt: (0, utils_1.nowIso)(),
                };
                if (existing)
                    Object.assign(existing, settlement);
                else
                    state.partnerSettlements.unshift(settlement);
                for (const row of state.partnerTransactions) {
                    if (transactionIds.includes(String(row.id)))
                        row.status = "settled";
                }
                return settlement;
            });
        });
    }
    async markPaid(id) {
        return this.runtime.update((state) => {
            const settlement = state.partnerSettlements.find((row) => row.id === id);
            if (!settlement)
                throw new common_1.NotFoundException("Partner settlement not found.");
            settlement.status = "paid";
            settlement.paidAt = (0, utils_1.nowIso)();
            settlement.updatedAt = (0, utils_1.nowIso)();
            return settlement;
        });
    }
    async setStatus(partnerId, isActive) {
        return this.runtime.update((state) => {
            const catalog = state.partners || {};
            const existing = catalog[partnerId] || {
                id: partnerId,
                partnerCode: partnerId,
                partnerName: partnerId,
                description: null,
                logoUrl: null,
                conversionRate: 10,
            };
            catalog[partnerId] = {
                ...existing,
                id: partnerId,
                isActive,
                updatedAt: (0, utils_1.nowIso)(),
            };
            state.partners = catalog;
            return catalog[partnerId];
        });
    }
    async findSettlementByPartnerMonth(partnerId, month) {
        const state = await this.runtime.read();
        const settlement = state.partnerSettlements.find((row) => (0, utils_1.cleanString)(row.partnerId) === partnerId && (0, utils_1.cleanString)(row.month) === month);
        if (!settlement)
            throw new common_1.NotFoundException("Partner settlement not found.");
        return settlement;
    }
    async settlementPdf(id) {
        const state = await this.runtime.read();
        const settlement = state.partnerSettlements.find((row) => row.id === id);
        if (!settlement)
            throw new common_1.NotFoundException("Partner settlement not found.");
        const lines = [
            "System 3 Loyalty Partner Settlement",
            `Settlement ID: ${settlement.id}`,
            `Partner ID: ${settlement.partnerId}`,
            `Partner Name: ${settlement.partnerName}`,
            `Month: ${settlement.month}`,
            `Gross Amount: ${(0, utils_1.numberValue)(settlement.grossAmount, this.money(settlement)).toFixed(2)}`,
            `Commission: ${(0, utils_1.numberValue)(settlement.commissionAmount, 0).toFixed(2)}`,
            `Status: ${settlement.status}`,
        ];
        return this.tinyPdf(lines.join("\\n"));
    }
    tinyPdf(text) {
        const safe = text.replace(/[()\\]/g, "\\$&").replace(/\r?\n/g, "\\n");
        const body = [
            "%PDF-1.4",
            "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
            "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
            "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
            `4 0 obj << /Length ${safe.length + 64} >> stream\nBT /F1 12 Tf 72 720 Td (${safe}) Tj ET\nendstream endobj`,
            "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
            "xref\n0 6\n0000000000 65535 f \n",
            "trailer << /Root 1 0 R /Size 6 >>",
            "startxref\n0\n%%EOF",
        ].join("\n");
        return Buffer.from(body, "utf8");
    }
};
exports.PartnersService = PartnersService;
exports.PartnersService = PartnersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [local_runtime_service_1.LocalRuntimeService])
], PartnersService);
//# sourceMappingURL=partners.service.js.map