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
exports.CampaignsService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const local_runtime_service_1 = require("../local-runtime/local-runtime.service");
const utils_1 = require("../common/utils");
const supabase_service_1 = require("../supabase/supabase.service");
let CampaignsService = class CampaignsService {
    runtime;
    supabase;
    constructor(runtime, supabase) {
        this.runtime = runtime;
        this.supabase = supabase;
    }
    generatedId() {
        return (0, crypto_1.randomUUID)();
    }
    generatedCode(campaignType) {
        const prefix = campaignType === "flash_sale" ? "FLASH" : "CMP";
        return `${prefix}-${(0, crypto_1.randomUUID)().slice(0, 8).toUpperCase()}`;
    }
    normalize(input) {
        const rawId = (0, utils_1.hasTemplateToken)(input.id) ? "" : String(input.id || "").trim();
        const rawCode = (0, utils_1.hasTemplateToken)(input.campaignCode ?? input.campaign_code)
            ? ""
            : String(input.campaignCode || input.campaign_code || "").trim();
        const campaignType = String(input.campaignType || input.campaign_type || "bonus_points");
        const id = rawId || this.generatedId();
        return {
            ...input,
            id,
            campaignCode: rawCode || this.generatedCode(campaignType),
            campaignName: String(input.campaignName || input.campaign_name || input.name || "Campaign").trim(),
            campaignType,
            status: String(input.status || "draft"),
            multiplier: (0, utils_1.numberValue)(input.multiplier, 1),
            minimumPurchaseAmount: (0, utils_1.numberValue)(input.minimumPurchaseAmount ?? input.minimum_purchase_amount, 0),
            bonusPoints: Math.floor((0, utils_1.numberValue)(input.bonusPoints ?? input.bonus_points, 0)),
            productScope: Array.isArray(input.productScope ?? input.product_scope) ? (input.productScope ?? input.product_scope) : [],
            eligibleTiers: Array.isArray(input.eligibleTiers ?? input.eligible_tiers) ? (input.eligibleTiers ?? input.eligible_tiers) : [],
            rewardId: input.rewardId === null || input.reward_id === null
                ? null
                : input.rewardId !== undefined || input.reward_id !== undefined
                    ? String(input.rewardId ?? input.reward_id)
                    : null,
            startsAt: String(input.startsAt || input.starts_at || (0, utils_1.nowIso)()),
            endsAt: String(input.endsAt || input.ends_at || new Date(Date.now() + 7 * 86400_000).toISOString()),
            bannerTitle: input.bannerTitle ?? input.banner_title ?? null,
            bannerMessage: input.bannerMessage ?? input.banner_message ?? null,
            bannerColor: String(input.bannerColor ?? input.banner_color ?? "#1A2B47"),
            countdownLabel: input.countdownLabel ?? input.countdown_label ?? null,
            pushNotificationEnabled: Boolean(input.pushNotificationEnabled ?? input.push_notification_enabled ?? false),
            budgetLimit: input.budgetLimit === null || input.budget_limit === null
                ? null
                : input.budgetLimit !== undefined || input.budget_limit !== undefined
                    ? (0, utils_1.numberValue)(input.budgetLimit ?? input.budget_limit, 0)
                    : null,
            budgetSpent: (0, utils_1.numberValue)(input.budgetSpent ?? input.budget_spent, 0),
            flashSaleQuantityLimit: input.flashSaleQuantityLimit === null || input.flash_sale_quantity_limit === null
                ? null
                : input.flashSaleQuantityLimit !== undefined || input.flash_sale_quantity_limit !== undefined
                    ? (0, utils_1.numberValue)(input.flashSaleQuantityLimit ?? input.flash_sale_quantity_limit, 0)
                    : null,
            flashSaleClaimedCount: (0, utils_1.numberValue)(input.flashSaleClaimedCount ?? input.flash_sale_claimed_count, 0),
            autoPause: Boolean(input.autoPause ?? input.auto_pause ?? true),
            createdAt: String(input.createdAt || input.created_at || (0, utils_1.nowIso)()),
            publishedAt: input.publishedAt ?? input.published_at ?? null,
        };
    }
    async create(input) {
        if (!input.campaignName && !input.name)
            throw new common_1.BadRequestException("campaignName is required.");
        return this.runtime.update((state) => {
            const campaign = this.normalize(input);
            state.campaigns[String(campaign.id)] = campaign;
            return campaign;
        });
    }
    async list() {
        const state = await this.runtime.read();
        const merged = new Map();
        for (const campaign of Object.values(state.campaigns)) {
            if ((0, utils_1.hasTemplateToken)(campaign.id))
                continue;
            const normalized = this.normalize(campaign);
            merged.set(String(normalized.id), normalized);
        }
        const admin = this.supabase.admin;
        if (admin) {
            const { data, error } = await admin.from("promotion_campaigns").select("*").order("created_at", { ascending: false });
            if (!error) {
                for (const row of data || []) {
                    const normalized = this.normalize(row);
                    merged.set(String(normalized.id), { ...(merged.get(String(normalized.id)) || normalized), ...normalized });
                }
            }
        }
        return Array.from(merged.values())
            .filter((campaign) => !(0, utils_1.hasTemplateToken)(campaign.id))
            .sort((left, right) => new Date(String(right.createdAt)).getTime() - new Date(String(left.createdAt)).getTime());
    }
    async get(id) {
        const state = await this.runtime.read();
        const campaign = state.campaigns[id];
        if (!campaign)
            throw new common_1.NotFoundException("Campaign not found.");
        return this.normalize(campaign);
    }
    async active(tier) {
        const now = Date.now();
        return (await this.list()).filter((campaign) => {
            const eligibleTiers = Array.isArray(campaign.eligibleTiers) ? campaign.eligibleTiers.map(String) : [];
            return (campaign.status === "active" &&
                new Date(String(campaign.startsAt)).getTime() <= now &&
                new Date(String(campaign.endsAt)).getTime() >= now &&
                (!tier || eligibleTiers.length === 0 || eligibleTiers.some((entry) => entry.toLowerCase() === tier.toLowerCase())));
        });
    }
    async publish(id) {
        return this.runtime.update((state) => {
            const existing = state.campaigns[id];
            if (!existing)
                throw new common_1.NotFoundException("Campaign not found.");
            const campaign = this.normalize({ ...existing, status: "active", publishedAt: (0, utils_1.nowIso)() });
            state.campaigns[id] = campaign;
            return campaign;
        });
    }
    budgetStatus(campaign) {
        const normalized = this.normalize(campaign);
        const budgetLimit = normalized.budgetLimit === null ? null : (0, utils_1.numberValue)(normalized.budgetLimit, 0);
        const budgetSpent = (0, utils_1.numberValue)(normalized.budgetSpent, 0);
        return {
            campaignId: normalized.id,
            campaignName: normalized.campaignName,
            status: normalized.status,
            active: normalized.status === "active",
            budgetLimit,
            budgetSpent,
            budgetRemaining: budgetLimit === null ? null : Math.max(0, budgetLimit - budgetSpent),
            utilizationPercent: budgetLimit && budgetLimit > 0 ? Number(Math.min(100, (budgetSpent / budgetLimit) * 100).toFixed(1)) : 0,
            trackedTransactions: 0,
            pointsAwarded: budgetSpent,
            notificationsSent: 0,
            redemptionCount: 0,
            quantityLimit: normalized.flashSaleQuantityLimit ?? null,
            quantityClaimed: (0, utils_1.numberValue)(normalized.flashSaleClaimedCount, 0),
            sellThrough: null,
        };
    }
    async performance() {
        return (await this.list()).map((campaign) => ({
            campaign_id: campaign.id,
            campaign_code: campaign.campaignCode,
            campaign_name: campaign.campaignName,
            campaign_type: campaign.campaignType,
            status: campaign.status,
            starts_at: campaign.startsAt,
            ends_at: campaign.endsAt,
            notifications_sent: 0,
            tracked_transactions: 0,
            points_awarded: (0, utils_1.numberValue)(campaign.budgetSpent, 0),
            redemption_count: 0,
            quantity_limit: campaign.flashSaleQuantityLimit ?? null,
            quantity_claimed: (0, utils_1.numberValue)(campaign.flashSaleClaimedCount, 0),
            sell_through: null,
            redemption_speed_per_hour: 0,
        }));
    }
};
exports.CampaignsService = CampaignsService;
exports.CampaignsService = CampaignsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [local_runtime_service_1.LocalRuntimeService,
        supabase_service_1.SupabaseService])
], CampaignsService);
//# sourceMappingURL=campaigns.service.js.map