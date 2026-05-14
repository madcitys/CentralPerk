import dotenv from "dotenv";
dotenv.config();

const serviceName = "segment-service";
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
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) fail(`Invalid URL protocol in environment variable: ${name}`);
  } catch {
    fail(`Invalid URL in environment variable: ${name}`);
  }
  return value;
}

function requirePostgresUrl(name: string) {
  const value = requireEnv(name);
  try {
    const parsed = new URL(value);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
      fail(`Invalid PostgreSQL URL protocol in environment variable: ${name}`);
    }
  } catch {
    fail(`Invalid PostgreSQL URL in environment variable: ${name}`);
  }
  return value;
}

function parsePort() {
  const raw = readEnv("PORT");
  if (!raw) return 4004;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail("Invalid port in environment variable: PORT");
  return port;
}

export const config = {
  serviceName,
  dbMode: splitMode ? "split" : "shared",
  splitMode,
  port: parsePort(),
  schema: splitMode ? requireEnv("SEGMENT_DB_SCHEMA") : readEnv("SEGMENT_DB_SCHEMA") || "public",
  databaseUrl: splitMode ? requirePostgresUrl("SEGMENT_DATABASE_URL") : readEnv("SEGMENT_DATABASE_URL") || readEnv("DATABASE_URL"),
  supabaseUrl: splitMode ? requireHttpUrl("SEGMENT_SUPABASE_URL") : readEnv("SUPABASE_URL"),
  supabaseServiceKey: splitMode
    ? requireEnv("SEGMENT_SUPABASE_SERVICE_ROLE_KEY")
    : readEnv("SUPABASE_SERVICE_ROLE_KEY") || readEnv("SUPABASE_ANON_KEY"),
};
