import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";
function scopedClient(url, key, schema) {
    const client = createClient(url || "http://127.0.0.1", key || "dummy-key", {
        auth: { autoRefreshToken: false, persistSession: false },
    });
    const usePublicSchema = String(process.env.LIVE_MODE || "").trim().toLowerCase() === "true";
    return usePublicSchema || schema === "public" ? client : client.schema(schema);
}
export const memberSupabase = createClient(config.memberSupabaseUrl || "http://127.0.0.1", config.memberSupabaseServiceKey || "dummy-key", { auth: { autoRefreshToken: false, persistSession: false } });
export const pointsSupabase = createClient(config.pointsSupabaseUrl || "http://127.0.0.1", config.pointsSupabaseServiceKey || "dummy-key", { auth: { autoRefreshToken: false, persistSession: false } });
export const rewardSupabase = createClient(config.rewardSupabaseUrl || "http://127.0.0.1", config.rewardSupabaseServiceKey || "dummy-key", { auth: { autoRefreshToken: false, persistSession: false } });
export const memberDb = scopedClient(config.memberSupabaseUrl, config.memberSupabaseServiceKey, config.memberSchema);
export const pointsDb = scopedClient(config.pointsSupabaseUrl, config.pointsSupabaseServiceKey, config.pointsSchema);
export const rewardDb = scopedClient(config.rewardSupabaseUrl, config.rewardSupabaseServiceKey, config.rewardSchema);
