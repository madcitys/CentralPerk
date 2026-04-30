import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || "0.0.0.0",
  pointsUrl: process.env.POINTS_ENGINE_URL || "http://127.0.0.1:4001",
  campaignUrl: process.env.CAMPAIGN_SERVICE_URL || "http://127.0.0.1:4002",
  memberUrl: process.env.MEMBER_SERVICE_URL || "http://127.0.0.1:4003",
  segmentUrl: process.env.SEGMENT_SERVICE_URL || "http://127.0.0.1:4004",
  notificationUrl: process.env.NOTIFICATION_SERVICE_URL || "http://127.0.0.1:4005",
  rewardUrl: process.env.REWARD_SERVICE_URL || "http://127.0.0.1:4006",
  nextApiUrl: process.env.NEXT_API_URL || "http://127.0.0.1:3000/api",
  backendApiUrl: process.env.BACKEND_API_URL || process.env.NEXT_API_URL || "http://127.0.0.1:3000/api",
  adminRole: (process.env.ADMIN_ROLE || "admin").toLowerCase(),
  useLocalRuntime:
    process.env.USE_LOCAL_LOYALTY_API === "true" || process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true",
};
