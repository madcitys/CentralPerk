import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { publicAnonKey, supabaseUrl } from '../../../utils/supabase/info';

export const hasSupabaseConfig = Boolean(supabaseUrl && publicAnonKey);
export const supabaseConfigError = hasSupabaseConfig
  ? ''
  : 'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and either NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY. In split database mode, MEMBER_SUPABASE_URL and MEMBER_SUPABASE_ANON_KEY are also supported.';

if (!hasSupabaseConfig) {
  throw new Error(supabaseConfigError);
}

declare global {
  // eslint-disable-next-line no-var
  var __centralperkSupabaseClient:
    | SupabaseClient<any, "public", any>
    | undefined;
}

export const supabase =
  globalThis.__centralperkSupabaseClient ??
  createClient(supabaseUrl, publicAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: `centralperk-auth-${supabaseUrl.replace(/^https?:\/\//, "").replace(/[^a-z0-9]/gi, "-")}`,
    },
  }) as SupabaseClient<any, "public", any>;

globalThis.__centralperkSupabaseClient = supabase;
