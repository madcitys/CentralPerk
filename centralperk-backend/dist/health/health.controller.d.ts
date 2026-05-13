import { ApiConfigService } from "../config/api-config.service";
import { SupabaseService } from "../supabase/supabase.service";
export declare class HealthController {
    private readonly config;
    private readonly supabase;
    constructor(config: ApiConfigService, supabase: SupabaseService);
    health(): {
        ok: boolean;
        status: string;
        service: string;
        mode: string;
        supabaseConfigured: boolean;
        timestamp: string;
    };
}
