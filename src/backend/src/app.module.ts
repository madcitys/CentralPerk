import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { SupabaseModule } from "./supabase/supabase.module";
import { LocalRuntimeModule } from "./local-runtime/local-runtime.module";
import { HealthModule } from "./health/health.module";
import { PointsModule } from "./points/points.module";
import { MembersModule } from "./members/members.module";
import { TiersModule } from "./tiers/tiers.module";
import { CampaignsModule } from "./campaigns/campaigns.module";
import { SegmentsModule } from "./segments/segments.module";
import { CommunicationsModule } from "./communications/communications.module";
import { PartnersModule } from "./partners/partners.module";
import { RewardsModule } from "./rewards/rewards.module";

@Module({
  imports: [
    ConfigModule,
    SupabaseModule,
    LocalRuntimeModule,
    HealthModule,
    PointsModule,
    MembersModule,
    TiersModule,
    CampaignsModule,
    SegmentsModule,
    CommunicationsModule,
    PartnersModule,
    RewardsModule,
  ],
})
export class AppModule {}
