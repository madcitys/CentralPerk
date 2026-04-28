import { Injectable } from "@nestjs/common";
import dotenv from "dotenv";
import path from "path";

@Injectable()
export class ApiConfigService {
  constructor() {
    dotenv.config({ path: path.resolve(process.cwd(), ".env"), quiet: true });
    dotenv.config({ path: path.resolve(process.cwd(), "../.env"), quiet: true });
    dotenv.config({ path: path.resolve(process.cwd(), "../../.env.local"), quiet: true });
    dotenv.config({ quiet: true });
  }

  get port() {
    return Number(process.env.PORT || 4000);
  }

  get localRuntimeStorePath() {
    const raw = process.env.LOCAL_RUNTIME_STORE_PATH || "../../.runtime/api-store.json";
    return path.resolve(process.cwd(), raw);
  }

  get useLocalFallback() {
    if (process.env.USE_LOCAL_LOYALTY_API === "false") {
      return !this.supabaseUrl || !this.supabaseServiceRoleKey;
    }
    return true;
  }

  get supabaseUrl() {
    return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  }

  get supabaseAnonKey() {
    return process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  }

  get supabaseServiceRoleKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  }

  get emailProvider() {
    return process.env.EMAIL_PROVIDER || "demo";
  }

  get smsProvider() {
    return process.env.SMS_PROVIDER || "demo";
  }
}
