import { Injectable } from "@nestjs/common";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

@Injectable()
export class ApiConfigService {
  constructor() {
    const candidatePaths = [
      path.resolve(process.cwd(), ".env.local"),
      path.resolve(process.cwd(), ".env"),
      path.resolve(process.cwd(), "../.env.local"),
      path.resolve(process.cwd(), "../.env"),
      path.resolve(process.cwd(), "../../.env.local"),
      path.resolve(process.cwd(), "../../.env"),
    ];

    for (const candidatePath of candidatePaths) {
      if (fs.existsSync(candidatePath)) {
        dotenv.config({ path: candidatePath, quiet: true, override: false });
      }
    }
  }

  get port() {
    return Number(process.env.PORT || 4000);
  }

  get localRuntimeStorePath() {
    const raw = process.env.LOCAL_RUNTIME_STORE_PATH || "../../.runtime/api-store.json";
    return path.resolve(process.cwd(), raw);
  }

  get useLocalFallback() {
    return (
      process.env.USE_LOCAL_LOYALTY_API !== "false" ||
      process.env.NEXT_PUBLIC_USE_LOCAL_LOYALTY_API === "true" ||
      process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true" ||
      !this.supabaseUrl ||
      !this.supabaseServiceRoleKey
    );
  }

  get supabaseUrl() {
    return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  }

  get supabaseServiceRoleKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  }
}
