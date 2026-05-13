import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serviceDir, "../..");
dotenv.config({ path: path.resolve(serviceDir, ".env"), quiet: true });
dotenv.config({ path: path.resolve(repoRoot, ".env"), quiet: true });
dotenv.config({ quiet: true });
const liveMode = String(process.env.LIVE_MODE || "").trim().toLowerCase() === "true";
const useSharedSupabase = liveMode && process.env.USE_SPLIT_SERVICE_DATABASES !== "true";
const sharedSupabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const sharedSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "";
export const config = {
    port: Number(process.env.PORT || 4002),
    campaignSupabaseUrl: useSharedSupabase ? sharedSupabaseUrl : process.env.CAMPAIGN_SUPABASE_URL || sharedSupabaseUrl,
    campaignSupabaseServiceKey: useSharedSupabase
        ? sharedSupabaseKey
        : process.env.CAMPAIGN_SUPABASE_SERVICE_ROLE_KEY ||
            process.env.CAMPAIGN_SUPABASE_ANON_KEY ||
            sharedSupabaseKey,
    memberSupabaseUrl: useSharedSupabase ? sharedSupabaseUrl : process.env.MEMBER_SUPABASE_URL || sharedSupabaseUrl,
    memberSupabaseServiceKey: useSharedSupabase
        ? sharedSupabaseKey
        : process.env.MEMBER_SUPABASE_SERVICE_ROLE_KEY ||
            process.env.MEMBER_SUPABASE_ANON_KEY ||
            sharedSupabaseKey,
    memberSchema: useSharedSupabase ? "public" : process.env.MEMBER_DB_SCHEMA || "member_service",
    campaignSchema: useSharedSupabase ? "public" : process.env.CAMPAIGN_DB_SCHEMA || "campaign_service",
    liveMode,
    useSharedSupabase,
    useLocalFallback: !liveMode &&
        (process.env.USE_LOCAL_LOYALTY_API === "true" || process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true"),
};
if (!config.campaignSupabaseUrl || !config.campaignSupabaseServiceKey || !config.memberSupabaseUrl || !config.memberSupabaseServiceKey) {
    console.warn("[campaign-service] Missing backend Supabase env; local fallback will be used.");
}
