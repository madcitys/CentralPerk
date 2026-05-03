import { Controller, Get } from "@nestjs/common";
import { ApiConfigService } from "../config/api-config.service";
import { SupabaseService } from "../supabase/supabase.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly config: ApiConfigService,
    private readonly supabase: SupabaseService,
  ) {}

  @Get()
  health() {
    return {
      ok: true,
      status: "healthy",
      service: "system-3-nest-backend",
      mode: this.config.useLocalFallback ? "local_runtime" : "supabase",
      supabaseConfigured: this.supabase.isConfigured,
      timestamp: new Date().toISOString(),
    };
  }
}
