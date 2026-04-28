import { createClient } from "@supabase/supabase-js";
import { publicAnonKey, supabaseUrl } from "../../utils/supabase/info";
export function createServerSupabaseClient() {
  const serverUrl =
    process.env.SUPABASE_URL?.trim() ||
    supabaseUrl ||
    "";
  const serverKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    publicAnonKey ||
    "";

  return createClient(
    serverUrl || "https://example.supabase.co",
    serverKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
