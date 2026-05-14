import { createClient } from "@supabase/supabase-js";
import { publicAnonKey, supabaseUrl } from "../../utils/supabase/info";

export function createServerSupabaseClient() {
  const serverUrl = supabaseUrl?.trim();
  const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!serverUrl) {
    throw new Error("Missing Supabase URL. Set NEXT_PUBLIC_SUPABASE_URL.");
  }

  if (!serverKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for server-side API access.");
  }

  return createClient(
    serverUrl,
    serverKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
