import type { NextConfig } from "next";

const publicSupabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  process.env.MEMBER_SUPABASE_URL ??
  "";

const publicSupabaseProjectId =
  process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID ??
  process.env.VITE_SUPABASE_PROJECT_ID ??
  (publicSupabaseUrl
    ? publicSupabaseUrl
        .replace(/^https?:\/\//, "")
        .replace(".supabase.co", "")
        .split(".")[0]
    : "");

const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.MEMBER_SUPABASE_ANON_KEY ??
  "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  env: {
    NEXT_PUBLIC_SUPABASE_URL: publicSupabaseUrl,
    NEXT_PUBLIC_SUPABASE_PROJECT_ID: publicSupabaseProjectId,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicSupabaseKey,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publicSupabaseKey,
    NEXT_PUBLIC_ENABLE_DEMO_AUTH:
      process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH ?? process.env.VITE_ENABLE_DEMO_AUTH ?? "",
    NEXT_PUBLIC_FORCE_CUSTOMER_DEMO_AUTH:
      process.env.NEXT_PUBLIC_FORCE_CUSTOMER_DEMO_AUTH ?? process.env.VITE_FORCE_CUSTOMER_DEMO_AUTH ?? "",
    NEXT_PUBLIC_USE_SPLIT_SERVICE_DATABASES:
      process.env.NEXT_PUBLIC_USE_SPLIT_SERVICE_DATABASES ?? process.env.USE_SPLIT_SERVICE_DATABASES ?? "",
    USE_SPLIT_SERVICE_DATABASES: process.env.USE_SPLIT_SERVICE_DATABASES ?? "",
  },
  experimental: {
    workerThreads: false,
    webpackBuildWorker: false,
  },
};

export default nextConfig;
