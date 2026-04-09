import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = __ENV.K6_BASE_URL || "http://localhost:3000";
const authToken = __ENV.K6_AUTH_TOKEN || "";
const memberIdentifier = __ENV.K6_MEMBER_IDENTIFIER || "MEM-000001";
const fallbackEmail = __ENV.K6_MEMBER_EMAIL || "john@example.com";
const rewardCatalogId = __ENV.K6_REWARD_CATALOG_ID || "RW009";
const redeemPoints = Number(__ENV.K6_REDEEM_POINTS || 5);
const flashSaleCampaignRef = __ENV.K6_FLASH_SALE_CAMPAIGN || "";
const notificationCampaignRef = __ENV.K6_NOTIFICATION_CAMPAIGN || "CMP-WEEKEND-2X";
let cachedFlashSaleCampaignRef;
let flashSaleLookupAttempted = false;

const jsonHeaders = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

if (authToken) {
  jsonHeaders.Authorization = `Bearer ${authToken}`;
}

export const options = {
  scenarios: {
    award_points_purchase: {
      executor: "constant-arrival-rate",
      rate: 16,
      timeUnit: "1m",
      duration: "5m",
      preAllocatedVUs: 10,
      maxVUs: 30,
      exec: "awardPointsPurchase",
      tags: { flow: "award-points", weight: "32" },
    },
    redeem_reward: {
      executor: "constant-arrival-rate",
      rate: 10,
      timeUnit: "1m",
      duration: "5m",
      preAllocatedVUs: 8,
      maxVUs: 20,
      exec: "redeemReward",
      tags: { flow: "redeem-points", weight: "20" },
    },
    resolve_campaign_bonus: {
      executor: "constant-arrival-rate",
      rate: 8,
      timeUnit: "1m",
      duration: "5m",
      preAllocatedVUs: 6,
      maxVUs: 18,
      exec: "resolveCampaigns",
      tags: { flow: "resolve-campaigns", weight: "16" },
    },
    claim_flash_sale: {
      executor: "constant-arrival-rate",
      rate: 4,
      timeUnit: "1m",
      duration: "5m",
      preAllocatedVUs: 4,
      maxVUs: 12,
      exec: "claimFlashSale",
      tags: { flow: "claim-flash-sale", weight: "8" },
    },
    campaign_analytics: {
      executor: "constant-arrival-rate",
      rate: 6,
      timeUnit: "1m",
      duration: "5m",
      preAllocatedVUs: 4,
      maxVUs: 12,
      exec: "loadCampaignAnalytics",
      tags: { flow: "campaign-analytics", weight: "12" },
    },
    queue_campaign_notifications: {
      executor: "constant-arrival-rate",
      rate: 6,
      timeUnit: "1m",
      duration: "5m",
      preAllocatedVUs: 4,
      maxVUs: 12,
      exec: "queueCampaignNotifications",
      tags: { flow: "campaign-notifications", weight: "12" },
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<4500", "avg<2200"],
    "http_req_duration{flow:award-points}": ["p(95)<4500"],
    "http_req_duration{flow:redeem-points}": ["p(95)<4500"],
    "http_req_duration{flow:resolve-campaigns}": ["p(95)<800"],
    "http_req_duration{flow:claim-flash-sale}": ["p(95)<2500"],
    "http_req_duration{flow:campaign-analytics}": ["p(95)<2500"],
    "http_req_duration{flow:campaign-notifications}": ["p(95)<2500"],
  },
};

function summaryDir() {
  return __ENV.K6_SUMMARY_DIR || "tests/load/results";
}

function buildSummaryText(data) {
  const totalRequests = data.metrics?.http_reqs?.values?.count ?? 0;
  const failureRate = data.metrics?.http_req_failed?.values?.rate ?? 0;
  const p95Duration = data.metrics?.http_req_duration?.values?.["p(95)"] ?? 0;

  return [
    "CentralPerk k6 baseline summary",
    `total requests: ${totalRequests}`,
    `failure rate: ${failureRate}`,
    `p95 duration: ${p95Duration}`,
  ].join("\n");
}

export function handleSummary(data) {
  const dir = summaryDir();
  const summaryJson = JSON.stringify(data, null, 2);
  const summaryText = buildSummaryText(data);

  return {
    [`${dir}/summary.json`]: summaryJson,
    [`${dir}/summary.txt`]: summaryText,
    stdout: summaryText,
  };
}

function postJson(path, payload) {
  return http.post(`${baseUrl}${path}`, JSON.stringify(payload), {
    headers: jsonHeaders,
  });
}

function buildIdempotencyKey(prefix) {
  return `${prefix}-${__VU}-${__ITER}-${Date.now()}`;
}

function resolveActiveFlashSaleCampaignRef() {
  if (flashSaleCampaignRef) return flashSaleCampaignRef;
  if (flashSaleLookupAttempted) return cachedFlashSaleCampaignRef;

  flashSaleLookupAttempted = true;
  const response = http.get(`${baseUrl}/api/campaigns/performance`, {
    headers: jsonHeaders,
  });

  if (response.status !== 200) {
    cachedFlashSaleCampaignRef = null;
    return cachedFlashSaleCampaignRef;
  }

  const items = response.json("items");
  if (!Array.isArray(items)) {
    cachedFlashSaleCampaignRef = null;
    return cachedFlashSaleCampaignRef;
  }

  const now = Date.now();
  const activeFlashSale = items.find((item) => {
    const campaignType = String(item?.campaignType || "").toLowerCase();
    const startsAt = new Date(String(item?.startsAt || "")).getTime();
    const endsAt = new Date(String(item?.endsAt || "")).getTime();

    return campaignType === "flash_sale" && Number.isFinite(startsAt) && Number.isFinite(endsAt) && startsAt <= now && endsAt >= now;
  });

  cachedFlashSaleCampaignRef = activeFlashSale?.campaignCode ? String(activeFlashSale.campaignCode) : null;
  return cachedFlashSaleCampaignRef;
}

export function awardPointsPurchase() {
  const response = postJson("/api/points/award", {
    memberIdentifier,
    fallbackEmail,
    transactionType: "PURCHASE",
    reason: "k6 purchase award",
    amountSpent: 175.5,
    productCode: "LATTE-ICED",
    productCategory: "beverage",
    points: 0,
    idempotencyKey: buildIdempotencyKey("award"),
  });

  check(response, {
    "award points status is 200": (res) => res.status === 200,
    "award points returns balance": (res) => res.status === 200 && Boolean(res.json("newBalance")),
  });

  sleep(1);
}

export function redeemReward() {
  const response = postJson("/api/points/redeem", {
    memberIdentifier,
    fallbackEmail,
    points: redeemPoints,
    reason: "k6 reward redemption",
    transactionType: "REDEEM",
    rewardCatalogId,
    idempotencyKey: buildIdempotencyKey("redeem"),
  });

  check(response, {
    "redeem points status is 200": (res) => res.status === 200,
    "redeem points returns deduction": (res) => res.status === 200 && Boolean(res.json("pointsDeducted")),
  });

  sleep(1);
}

export function resolveCampaigns() {
  const response = postJson("/api/campaigns/resolve-purchase", {
    memberId: 1,
    purchaseAmount: 225,
    basePoints: 22,
    memberTier: "Gold",
    productScope: "beverage",
  });

  check(response, {
    "resolve campaigns status is 200": (res) => res.status === 200,
    "resolve campaigns returns list": (res) => Array.isArray(res.json("campaigns")),
  });

  sleep(1);
}

export function claimFlashSale() {
  const activeFlashSaleRef = resolveActiveFlashSaleCampaignRef();
  if (!activeFlashSaleRef) {
    sleep(1);
    return;
  }

  const response = postJson("/api/campaigns/flash-sale/claim", {
    campaignId: activeFlashSaleRef,
    memberId: 1,
    rewardCatalogId,
    idempotencyKey: buildIdempotencyKey("flash-sale"),
  });

  check(response, {
    "flash sale claim status is 200": (res) => res.status === 200,
    "flash sale claim returns inventory": (res) => res.status === 200 && Boolean(res.json("claimedCount")),
  });

  sleep(1);
}

export function loadCampaignAnalytics() {
  const response = http.get(`${baseUrl}/api/campaigns/performance`, {
    headers: jsonHeaders,
  });

  check(response, {
    "campaign analytics status is 200": (res) => res.status === 200,
    "campaign analytics returns items": (res) => res.status === 200 && Array.isArray(res.json("items")),
  });

  sleep(1);
}

export function queueCampaignNotifications() {
  const response = postJson("/api/campaigns/notifications/queue", {
    campaignId: notificationCampaignRef,
    idempotencyKey: buildIdempotencyKey("notify"),
  });

  check(response, {
    "campaign notifications status is 200": (res) => res.status === 200,
    "campaign notifications returns queued count": (res) =>
      res.status === 200 && res.json("queuedCount") !== undefined,
  });

  sleep(1);
}
