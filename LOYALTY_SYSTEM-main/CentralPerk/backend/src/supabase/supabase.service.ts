import { Injectable } from "@nestjs/common";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ApiConfigService } from "../config/api-config.service";

@Injectable()
export class SupabaseService {
  private client: SupabaseClient | null = null;

  constructor(private readonly config: ApiConfigService) {}

  get isConfigured() {
    return Boolean(this.config.supabaseUrl && this.config.supabaseServiceRoleKey);
  }

  get admin() {
    if (!this.isConfigured) return null;
    if (!this.client) {
      this.client = createClient(this.config.supabaseUrl, this.config.supabaseServiceRoleKey, {
        auth: { persistSession: false },
      });
    }
    return this.client;
  }
}
