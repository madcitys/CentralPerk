import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4001),
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "",
};

if (!config.supabaseUrl || !config.supabaseServiceKey) {
  console.warn("[points-engine] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY; service calls will fail.");
}
