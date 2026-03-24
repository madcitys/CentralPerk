import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_PROJECT_ID:
      process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID ?? process.env.VITE_SUPABASE_PROJECT_ID ?? "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "",
    NEXT_PUBLIC_ENABLE_DEMO_AUTH:
      process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH ?? process.env.VITE_ENABLE_DEMO_AUTH ?? "",
    NEXT_PUBLIC_FORCE_CUSTOMER_DEMO_AUTH:
      process.env.NEXT_PUBLIC_FORCE_CUSTOMER_DEMO_AUTH ?? process.env.VITE_FORCE_CUSTOMER_DEMO_AUTH ?? "",
  },
};

export default nextConfig;
