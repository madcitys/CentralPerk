import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";
function scopedClient(url, key, schema) {
    const client = createClient(url || "http://127.0.0.1", key || "dummy-key", {
        auth: { autoRefreshToken: false, persistSession: false },
    });
    return config.liveMode || schema === "public" ? client : client.schema(schema);
}
export const campaignSupabase = createClient(config.campaignSupabaseUrl || "http://127.0.0.1", config.campaignSupabaseServiceKey || "dummy-key", { auth: { autoRefreshToken: false, persistSession: false } });
export const campaignDb = scopedClient(config.campaignSupabaseUrl, config.campaignSupabaseServiceKey, config.campaignSchema);
export const memberDb = scopedClient(config.memberSupabaseUrl, config.memberSupabaseServiceKey, config.memberSchema);
