import { SupabaseClient } from "@supabase/supabase-js";
import { ApiConfigService } from "../config/api-config.service";
export declare class SupabaseService {
    private readonly config;
    private client;
    constructor(config: ApiConfigService);
    get isConfigured(): boolean;
    get admin(): SupabaseClient<any, "public", "public", any, any> | null;
}
