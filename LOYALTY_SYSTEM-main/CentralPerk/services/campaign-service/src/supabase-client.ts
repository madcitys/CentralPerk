import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const url = config.supabaseUrl || "http://localhost";
const key = config.supabaseServiceKey || "dummy-key";

export const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});
