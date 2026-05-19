import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env") });
dotenv.config();

const serviceName = "member-service";
const splitMode = process.env.SCM_MEMBER_USE_SPLIT_SERVICE_DATABASES === "true";

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
  const raw = readEnv("SCM_MEMBER_PORT");
  if (!raw) return 3012;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail("Invalid port in environment variable: SCM_MEMBER_PORT");
  }
  return port;
}

export const config = {
  serviceName,
  dbMode: splitMode ? "split" : "shared",
  splitMode,
  port: parsePort(),
  schema: readEnv("SCM_MEMBER_DB_SCHEMA") || "public",
  databaseUrl: readEnv("SCM_MEMBER_DATABASE_URL") || readEnv("SCM_SHARED_DATABASE_URL"),
  supabaseUrl: requireHttpUrl("SCM_MEMBER_SUPABASE_URL"),
  supabaseServiceKey: requireEnv("SCM_MEMBER_SUPABASE_SERVICE_ROLE_KEY"),
};

export type ServiceConfig = typeof config;
