import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || "0.0.0.0",
  pointsUrl: process.env.POINTS_ENGINE_URL || "http://localhost:4001",
  campaignUrl: process.env.CAMPAIGN_SERVICE_URL || "http://localhost:4002",
  adminRole: (process.env.ADMIN_ROLE || "admin").toLowerCase(),
};
