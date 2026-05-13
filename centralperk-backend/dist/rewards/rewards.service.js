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
exports.RewardsService = void 0;
const common_1 = require("@nestjs/common");
const local_runtime_service_1 = require("../local-runtime/local-runtime.service");
const supabase_service_1 = require("../supabase/supabase.service");
function normalizeReward(row) {
    const rewardId = String(row.rewardCatalogId || row.reward_id || row.id || "");
    return {
        id: rewardId,
        rewardCatalogId: rewardId,
        name: String(row.name || "Reward"),
        description: row.description ? String(row.description) : null,
        pointsCost: Number(row.pointsCost ?? row.points_cost ?? 0),
        category: row.category ? String(row.category) : null,
        imageUrl: row.imageUrl ? String(row.imageUrl) : row.image_url ? String(row.image_url) : null,
        available: Boolean(row.available ?? row.is_active ?? true),
        active: Boolean(row.active ?? row.is_active ?? true),
        expiryDate: row.expiryDate ? String(row.expiryDate) : row.expiry_date ? String(row.expiry_date) : null,
        partnerId: row.partnerId ? String(row.partnerId) : row.partner_id ? String(row.partner_id) : null,
        cashValue: row.cashValue === null || row.cash_value === null
            ? null
            : row.cashValue !== undefined || row.cash_value !== undefined
                ? Number(row.cashValue ?? row.cash_value)
                : null,
        activeFlashSaleId: row.activeFlashSaleId ? String(row.activeFlashSaleId) : null,
        flashSaleStartsAt: row.flashSaleStartsAt ? String(row.flashSaleStartsAt) : null,
        flashSaleEndsAt: row.flashSaleEndsAt ? String(row.flashSaleEndsAt) : null,
        flashSaleQuantityLimit: row.flashSaleQuantityLimit === null || row.flashSaleQuantityLimit === undefined
            ? null
            : Number(row.flashSaleQuantityLimit),
        flashSaleClaimedCount: Number(row.flashSaleClaimedCount ?? 0),
        flashSaleBanner: row.flashSaleBanner ? String(row.flashSaleBanner) : null,
        flashSaleCountdownLabel: row.flashSaleCountdownLabel ? String(row.flashSaleCountdownLabel) : null,
    };
}
let RewardsService = class RewardsService {
    runtime;
    supabase;
    constructor(runtime, supabase) {
        this.runtime = runtime;
        this.supabase = supabase;
    }
    async localRewards() {
        const state = await this.runtime.read();
        return Object.values(state.rewards || {}).map((row) => normalizeReward(row));
    }
    async supabaseRewards() {
        const admin = this.supabase.admin;
        if (!admin)
            return [];
        const { data, error } = await admin
            .from("rewards_catalog")
            .select("*")
            .order("points_cost", { ascending: true });
        if (error)
            return [];
        return (data || []).map((row) => normalizeReward(row));
    }
    async list() {
        const merged = new Map();
        for (const reward of await this.localRewards()) {
            merged.set(reward.id, reward);
        }
        for (const reward of await this.supabaseRewards()) {
            merged.set(reward.id, { ...(merged.get(reward.id) || reward), ...reward });
        }
        return Array.from(merged.values()).sort((left, right) => left.pointsCost - right.pointsCost);
    }
    async active(tier) {
        const rewards = await this.list();
        const visible = rewards.filter((reward) => reward.active !== false && reward.available !== false);
        if (!tier)
            return visible;
        if (tier.toLowerCase() === "bronze")
            return visible.filter((reward) => reward.pointsCost <= 400);
        if (tier.toLowerCase() === "silver")
            return visible.filter((reward) => reward.pointsCost <= 600);
        return visible;
    }
    async get(id) {
        const reward = (await this.list()).find((item) => item.id === id || item.rewardCatalogId === id);
        if (!reward)
            throw new common_1.NotFoundException("Reward not found.");
        return reward;
    }
};
exports.RewardsService = RewardsService;
exports.RewardsService = RewardsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [local_runtime_service_1.LocalRuntimeService,
        supabase_service_1.SupabaseService])
], RewardsService);
//# sourceMappingURL=rewards.service.js.map