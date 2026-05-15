import { createClient } from '@supabase/supabase-js';
import { publicAnonKey, supabaseUrl } from '../../../utils/supabase/info';

export const hasSupabaseConfig = Boolean(supabaseUrl && publicAnonKey);
export const supabaseConfigError = hasSupabaseConfig
  ? ''
  : 'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and either NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in LOYALTY_SYSTEM-main/CentralPerk/.env or .env.local. Legacy VITE_* aliases are still supported. In split database mode, MEMBER_SUPABASE_URL and MEMBER_SUPABASE_ANON_KEY can be used as the frontend fallback.';

export const supabase = createClient(
  supabaseUrl || 'https://example.supabase.co',
  publicAnonKey || 'missing-supabase-key',
);
