"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_module_1 = require("./config/config.module");
const supabase_module_1 = require("./supabase/supabase.module");
const local_runtime_module_1 = require("./local-runtime/local-runtime.module");
const health_module_1 = require("./health/health.module");
const points_module_1 = require("./points/points.module");
const members_module_1 = require("./members/members.module");
const tiers_module_1 = require("./tiers/tiers.module");
const campaigns_module_1 = require("./campaigns/campaigns.module");
const segments_module_1 = require("./segments/segments.module");
const communications_module_1 = require("./communications/communications.module");
const partners_module_1 = require("./partners/partners.module");
const rewards_module_1 = require("./rewards/rewards.module");
const admin_mobile_module_1 = require("./admin-mobile/admin-mobile.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_module_1.ConfigModule,
            supabase_module_1.SupabaseModule,
            local_runtime_module_1.LocalRuntimeModule,
            health_module_1.HealthModule,
            points_module_1.PointsModule,
            members_module_1.MembersModule,
            tiers_module_1.TiersModule,
            campaigns_module_1.CampaignsModule,
            segments_module_1.SegmentsModule,
            communications_module_1.CommunicationsModule,
            partners_module_1.PartnersModule,
            rewards_module_1.RewardsModule,
            admin_mobile_module_1.AdminMobileModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map