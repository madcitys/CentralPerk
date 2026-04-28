import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serviceDir, "../..");

dotenv.config({ path: path.resolve(serviceDir, ".env"), quiet: true });
dotenv.config({ path: path.resolve(repoRoot, ".env"), quiet: true });
dotenv.config({ quiet: true });

export const config = {
  port: Number(process.env.PORT || 4001),
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "",
  useLocalFallback:
    process.env.USE_LOCAL_LOYALTY_API === "true" || process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true",
};

if (!config.supabaseUrl || !config.supabaseServiceKey) {
  console.warn("[points-engine] Missing backend Supabase env; local fallback will be used.");
}
