import { createClient } from "@supabase/supabase-js";
import { publicAnonKey, supabaseUrl } from "../../utils/supabase/info";

// Prefer the service-role key on the server. If it is not configured yet,
// the API falls back to the public key so local development can still run.
export function createServerSupabaseClient() {
  const serverKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    publicAnonKey ||
    "";

  return createClient(
    supabaseUrl || "https://example.supabase.co",
    serverKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
