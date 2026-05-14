import dotenv from "dotenv";
dotenv.config();

const serviceName = "points-engine";
const splitMode = process.env.USE_SPLIT_SERVICE_DATABASES === "true";

function readEnv(name: string) {
  return process.env[name]?.trim() || "";
}

function fail(message: string): never {
  throw new Error(`[${serviceName}] ${message}`);
}

function requireEnv(name: string) {
  const value = readEnv(name);
  if (!value) fail(`Missing required environment variable: ${name}`);
  return value;
}

function requireHttpUrl(name: string) {
  const value = requireEnv(name);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail(`Invalid URL in environment variable: ${name}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    fail(`Invalid URL protocol in environment variable: ${name}`);
  }
  return value;
}

function requirePostgresUrl(name: string) {
  const value = requireEnv(name);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail(`Invalid PostgreSQL URL in environment variable: ${name}`);
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    fail(`Invalid PostgreSQL URL protocol in environment variable: ${name}`);
  }
  return value;
}

function parsePort() {
  const raw = readEnv("PORT");
  if (!raw) return 4001;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail("Invalid port in environment variable: PORT");
  }
  return port;
}

const legacySupabaseUrl = readEnv("SUPABASE_URL");
const legacySupabaseServiceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY") || readEnv("SUPABASE_ANON_KEY");

export const config = {
  serviceName,
  dbMode: splitMode ? "split" : "shared",
  splitMode,
  port: parsePort(),
  schema: splitMode ? requireEnv("POINTS_DB_SCHEMA") : readEnv("POINTS_DB_SCHEMA") || "public",
  databaseUrl: splitMode ? requirePostgresUrl("POINTS_DATABASE_URL") : readEnv("POINTS_DATABASE_URL") || readEnv("DATABASE_URL"),
  supabaseUrl: splitMode ? requireHttpUrl("POINTS_SUPABASE_URL") : legacySupabaseUrl,
  supabaseServiceKey: splitMode ? requireEnv("POINTS_SUPABASE_SERVICE_ROLE_KEY") : legacySupabaseServiceKey,
  memberServiceUrl: splitMode ? requireHttpUrl("MEMBER_SERVICE_URL") : readEnv("MEMBER_SERVICE_URL") || "http://localhost:4003",
  campaignServiceUrl: readEnv("CAMPAIGN_SERVICE_URL") || "http://localhost:4002",
};

export type ServiceConfig = typeof config;
