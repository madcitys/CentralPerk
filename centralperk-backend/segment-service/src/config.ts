import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env") });
dotenv.config();

const serviceName = "segment-service";
const splitMode = process.env.SCM_SEGMENT_USE_SPLIT_SERVICE_DATABASES === "true";

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
  const raw = readEnv("SCM_SEGMENT_PORT");
  if (!raw) return 3013;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail("Invalid port in environment variable: SCM_SEGMENT_PORT");
  return port;
}

export const config = {
  serviceName,
  dbMode: splitMode ? "split" : "shared",
  splitMode,
  port: parsePort(),
  schema: readEnv("SCM_SEGMENT_DB_SCHEMA") || "public",
  databaseUrl: readEnv("SCM_SEGMENT_DATABASE_URL") || readEnv("SCM_SHARED_DATABASE_URL"),
  supabaseUrl: requireHttpUrl("SCM_SEGMENT_SUPABASE_URL"),
  supabaseServiceKey: requireEnv("SCM_SEGMENT_SUPABASE_SERVICE_ROLE_KEY"),
  memberServiceUrl: splitMode ? requireHttpUrl("SCM_MEMBER_SERVICE_URL") : readEnv("SCM_MEMBER_SERVICE_URL") || "http://localhost:3012",
};
