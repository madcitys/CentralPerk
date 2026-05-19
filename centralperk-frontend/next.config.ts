import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    const value = rawValue.replace(/^["']|["']$/g, "");
    process.env[key] = value;
  }
}

const appDir = process.cwd();
const repoDir = path.resolve(appDir, "..");

for (const envFile of [
  path.join(repoDir, ".env"),
  path.join(appDir, ".env"),
  path.join(appDir, ".envlocal"),
  path.join(appDir, ".env.local"),
]) {
  loadEnvFile(envFile);
}

const publicSupabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.MEMBER_SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
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
  process.env.MEMBER_SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  allowedDevOrigins: ["localhost", "127.0.0.1"],
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
