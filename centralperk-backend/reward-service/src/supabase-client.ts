import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

export const supabase = createClient(config.supabaseUrl || "https://placeholder.invalid", config.supabaseServiceKey || "placeholder-service-key", {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: config.schema },
});
