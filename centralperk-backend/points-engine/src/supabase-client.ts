import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const url = config.supabaseUrl || "https://placeholder.invalid";
const key = config.supabaseServiceKey || "placeholder-service-key";

export const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: config.schema },
});
