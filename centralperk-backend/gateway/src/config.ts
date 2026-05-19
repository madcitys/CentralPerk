import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env") });
dotenv.config();

const serviceName = "gateway";

function readEnv(name: string) {
  return process.env[name]?.trim() || "";
}

function fail(message: string): never {
  throw new Error(`[${serviceName}] ${message}`);
}

function parsePort() {
  const raw = readEnv("SCM_GATEWAY_PORT");
  if (!raw) return 3011;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail("Invalid port in environment variable: SCM_GATEWAY_PORT");
  }
  return port;
}

function requireHttpUrl(name: string) {
  const value = readEnv(name);
  if (!value) fail(`Missing required environment variable: ${name}`);
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

export const config = {
  serviceName,
  dbMode: "none",
  port: parsePort(),
  host: readEnv("SCM_GATEWAY_HOST") || "0.0.0.0",
  gatewayUrl: requireHttpUrl("SCM_GATEWAY_URL"),
  memberUrl: requireHttpUrl("SCM_MEMBER_SERVICE_URL"),
  segmentUrl: requireHttpUrl("SCM_SEGMENT_SERVICE_URL"),
  campaignUrl: requireHttpUrl("SCM_CAMPAIGN_SERVICE_URL"),
  notificationUrl: requireHttpUrl("SCM_NOTIFICATION_SERVICE_URL"),
  rewardUrl: requireHttpUrl("SCM_REWARD_SERVICE_URL"),
  pointsUrl: requireHttpUrl("SCM_POINTS_SERVICE_URL"),
  adminRole: (readEnv("SCM_GATEWAY_ADMIN_ROLE") || "admin").toLowerCase(),
};
