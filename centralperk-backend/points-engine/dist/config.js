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
    port: Number(process.env.PORT || 4001),
    memberSupabaseUrl: useSharedSupabase ? sharedSupabaseUrl : process.env.MEMBER_SUPABASE_URL || sharedSupabaseUrl,
    memberSupabaseServiceKey: useSharedSupabase
        ? sharedSupabaseKey
        : process.env.MEMBER_SUPABASE_SERVICE_ROLE_KEY ||
            process.env.MEMBER_SUPABASE_ANON_KEY ||
            sharedSupabaseKey,
    pointsSupabaseUrl: useSharedSupabase ? sharedSupabaseUrl : process.env.POINTS_SUPABASE_URL || sharedSupabaseUrl,
    pointsSupabaseServiceKey: useSharedSupabase
        ? sharedSupabaseKey
        : process.env.POINTS_SUPABASE_SERVICE_ROLE_KEY ||
            process.env.POINTS_SUPABASE_ANON_KEY ||
            sharedSupabaseKey,
    rewardSupabaseUrl: useSharedSupabase ? sharedSupabaseUrl : process.env.REWARD_SUPABASE_URL || sharedSupabaseUrl,
    rewardSupabaseServiceKey: useSharedSupabase
        ? sharedSupabaseKey
        : process.env.REWARD_SUPABASE_SERVICE_ROLE_KEY ||
            process.env.REWARD_SUPABASE_ANON_KEY ||
            sharedSupabaseKey,
    memberSchema: useSharedSupabase ? "public" : process.env.MEMBER_DB_SCHEMA || "member_service",
    pointsSchema: useSharedSupabase ? "public" : process.env.POINTS_DB_SCHEMA || "points_engine",
    rewardSchema: useSharedSupabase ? "public" : process.env.REWARD_DB_SCHEMA || "reward_service",
    useLocalFallback: process.env.USE_LOCAL_LOYALTY_API === "true" || process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true",
    liveMode,
    useSharedSupabase,
};
if (!config.memberSupabaseUrl ||
    !config.memberSupabaseServiceKey ||
    !config.pointsSupabaseUrl ||
    !config.pointsSupabaseServiceKey ||
    !config.rewardSupabaseUrl ||
    !config.rewardSupabaseServiceKey) {
    console.warn("[points-engine] Missing backend Supabase env; local fallback will be used.");
}
