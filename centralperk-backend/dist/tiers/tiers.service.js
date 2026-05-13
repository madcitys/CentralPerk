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
exports.TiersService = exports.DEFAULT_TIERS = void 0;
const common_1 = require("@nestjs/common");
const supabase_service_1 = require("../supabase/supabase.service");
exports.DEFAULT_TIERS = [
    { tier_label: "Platinum", min_points: 1500, is_active: true },
    { tier_label: "Gold", min_points: 750, is_active: true },
    { tier_label: "Silver", min_points: 250, is_active: true },
    { tier_label: "Bronze", min_points: 0, is_active: true },
];
let TiersService = class TiersService {
    supabase;
    cache = null;
    constructor(supabase) {
        this.supabase = supabase;
    }
    async listTiers() {
        if (this.cache && Date.now() - this.cache.loadedAt < 30_000)
            return this.cache.value;
        const client = this.supabase.admin;
        if (!client)
            return exports.DEFAULT_TIERS;
        const { data, error } = await client
            .from("points_tiers")
            .select("tier_label,min_points,is_active")
            .eq("is_active", true)
            .order("min_points", { ascending: false });
        if (error || !data?.length)
            return exports.DEFAULT_TIERS;
        const value = data.map((row) => ({
            tier_label: String(row.tier_label || "Bronze"),
            min_points: Number(row.min_points || 0),
            is_active: Boolean(row.is_active ?? true),
        }));
        this.cache = { loadedAt: Date.now(), value };
        return value;
    }
    async resolveTier(points) {
        const tiers = await this.listTiers();
        const active = tiers
            .filter((tier) => tier.is_active)
            .sort((left, right) => right.min_points - left.min_points);
        return active.find((tier) => points >= tier.min_points)?.tier_label || "Bronze";
    }
};
exports.TiersService = TiersService;
exports.TiersService = TiersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabase_service_1.SupabaseService])
], TiersService);
//# sourceMappingURL=tiers.service.js.map