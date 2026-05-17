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
  host: readEnv("HOST") || "0.0.0.0",
  gatewayUrl: requireHttpUrl("GATEWAY_URL"),
  memberUrl: requireHttpUrl("MEMBER_SERVICE_URL"),
  segmentUrl: requireHttpUrl("SEGMENT_SERVICE_URL"),
  campaignUrl: requireHttpUrl("CAMPAIGN_SERVICE_URL"),
  notificationUrl: requireHttpUrl("NOTIFICATION_SERVICE_URL"),
  rewardUrl: requireHttpUrl("REWARD_SERVICE_URL"),
  pointsUrl: requireHttpUrl("POINTS_SERVICE_URL"),
  adminRole: (readEnv("ADMIN_ROLE") || "admin").toLowerCase(),
};
