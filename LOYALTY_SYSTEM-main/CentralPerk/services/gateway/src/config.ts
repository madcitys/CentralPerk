import dotenv from "dotenv";
dotenv.config();

const serviceName = "gateway";

function readEnv(name: string) {
  return process.env[name]?.trim() || "";
}

function fail(message: string): never {
  throw new Error(`[${serviceName}] ${message}`);
}

function parsePort() {
  const raw = readEnv("PORT");
  if (!raw) return 4000;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail("Invalid port in environment variable: PORT");
  }
  return port;
}

function requireHttpUrl(name: string, fallback?: string) {
  const value = readEnv(name) || fallback || "";
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
  host: readEnv("HOST") || "0.0.0.0",
  gatewayUrl: requireHttpUrl("GATEWAY_URL", "http://localhost:4000"),
  memberUrl: requireHttpUrl("MEMBER_SERVICE_URL", "http://localhost:4003"),
  segmentUrl: requireHttpUrl("SEGMENT_SERVICE_URL", "http://localhost:4004"),
  campaignUrl: requireHttpUrl("CAMPAIGN_SERVICE_URL", "http://localhost:4002"),
  notificationUrl: requireHttpUrl("NOTIFICATION_SERVICE_URL", "http://localhost:4005"),
  rewardUrl: requireHttpUrl("REWARD_SERVICE_URL", "http://localhost:4006"),
  pointsUrl: requireHttpUrl("POINTS_SERVICE_URL", readEnv("POINTS_ENGINE_URL") || "http://localhost:4001"),
  adminRole: (readEnv("ADMIN_ROLE") || "admin").toLowerCase(),
};
