import http from "k6/http";
import { check } from "k6";

const BASE = (__ENV.GATEWAY_URL || "http://127.0.0.1:4000").replace(/\/+$/, "");
const ADMIN_ROLE = __ENV.ADMIN_ROLE || "admin";
const SEED_MEMBER_COUNT = Number(__ENV.LOYALTY_K6_MEMBER_COUNT || 20);
const AWARD_RATE = Number(__ENV.LOYALTY_K6_RATE_AWARD || 24);
const REDEEM_RATE = Number(__ENV.LOYALTY_K6_RATE_REDEEM || 12);
const TIERS_RATE = Number(__ENV.LOYALTY_K6_RATE_TIERS || 6);
const CAMPAIGN_RATE = Number(__ENV.LOYALTY_K6_RATE_CAMPAIGN_READS || 9);
const HEALTH_RATE = Number(__ENV.LOYALTY_K6_RATE_HEALTH || 3);
const TEST_DURATION = __ENV.LOYALTY_K6_DURATION || "30s";

export const options = {
  scenarios: {
    health: {
      executor: "constant-arrival-rate",
      rate: HEALTH_RATE,
      timeUnit: "1s",
      duration: TEST_DURATION,
      preAllocatedVUs: 4,
      exec: "healthScenario",
      tags: { scenario: "health" },
    },
    tier_reads: {
      executor: "constant-arrival-rate",
      rate: TIERS_RATE,
      timeUnit: "1s",
      duration: TEST_DURATION,
      preAllocatedVUs: 6,
      exec: "tiersScenario",
      tags: { scenario: "tiers" },
    },
    award_points: {
      executor: "constant-arrival-rate",
      rate: AWARD_RATE,
      timeUnit: "1s",
      duration: TEST_DURATION,
      preAllocatedVUs: 20,
      exec: "awardScenario",
      tags: { scenario: "award_points" },
    },
    redeem_points: {
      executor: "constant-arrival-rate",
      rate: REDEEM_RATE,
      timeUnit: "1s",
      duration: TEST_DURATION,
      preAllocatedVUs: 16,
      exec: "redeemScenario",
      tags: { scenario: "redeem_points" },
    },
    campaign_reads: {
      executor: "constant-arrival-rate",
      rate: CAMPAIGN_RATE,
      timeUnit: "1s",
      duration: TEST_DURATION,
      preAllocatedVUs: 10,
      exec: "campaignScenario",
      tags: { scenario: "campaign_reads" },
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.001"],
    "http_req_duration{scenario:health}": ["p(95)<250", "avg<150"],
    "http_req_duration{scenario:tiers}": ["p(95)<500", "avg<300"],
    "http_req_duration{scenario:award_points}": ["p(95)<900", "avg<500"],
    "http_req_duration{scenario:redeem_points}": ["p(95)<900", "avg<500"],
    "http_req_duration{scenario:campaign_reads}": ["p(95)<800", "avg<450"],
    checks: ["rate>0.99"],
  },
};

function jsonHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    ...extra,
  };
}

function memberIdentifier(seed, offset = 0) {
  const index = ((seed + offset) % SEED_MEMBER_COUNT) + 1;
  return `K6-MEMBER-${String(index).padStart(3, "0")}`;
}

function parseJson(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

export function setup() {
  const campaignPayload = {
    campaignCode: `K6-${Date.now()}`,
    campaignName: "k6 Baseline Campaign",
    campaignType: "multiplier_event",
    status: "draft",
    multiplier: 2,
    minimumPurchaseAmount: 0,
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2026-12-31T23:59:59.000Z",
    budgetLimit: 100000,
    autoPause: true,
  };

  const createCampaign = http.post(`${BASE}/campaigns`, JSON.stringify(campaignPayload), {
    headers: jsonHeaders({ "x-role": ADMIN_ROLE }),
    tags: { phase: "setup", endpoint: "campaigns_create" },
  });
  check(createCampaign, { "setup campaign created": (response) => response.status === 200 });
  const createdBody = parseJson(createCampaign) || {};
  const campaignId = createdBody?.campaign?.id;

  if (campaignId) {
    const publishCampaign = http.patch(
      `${BASE}/campaigns/${campaignId}/publish`,
      JSON.stringify({ queueNotifications: false }),
      {
        headers: jsonHeaders({ "x-role": ADMIN_ROLE }),
        tags: { phase: "setup", endpoint: "campaigns_publish" },
      }
    );
    check(publishCampaign, { "setup campaign published": (response) => response.status === 200 });
  }

  for (let index = 1; index <= SEED_MEMBER_COUNT; index += 1) {
    const memberId = memberIdentifier(index, 0);
    const response = http.post(
      `${BASE}/points/award`,
      JSON.stringify({
        memberIdentifier: memberId,
        fallbackEmail: `${memberId.toLowerCase()}@example.com`,
        points: 1000,
        transactionType: "MANUAL_AWARD",
        reason: "k6 seed balance",
      }),
      {
        headers: jsonHeaders({ "Idempotency-Key": `k6-seed-${memberId}` }),
        tags: { phase: "setup", endpoint: "points_award_seed" },
      }
    );
    check(response, { "setup member funded": (result) => result.status === 200 });
  }

  return {
    campaignId,
  };
}

export function healthScenario() {
  const response = http.get(`${BASE}/health`, {
    tags: { endpoint: "health" },
  });
  check(response, {
    "health status 200": (result) => result.status === 200,
    "health ok true": (result) => parseJson(result)?.ok === true,
  });
}

export function tiersScenario() {
  const response = http.get(`${BASE}/points/tiers`, {
    tags: { endpoint: "points_tiers" },
  });
  check(response, {
    "tiers status 200": (result) => result.status === 200,
    "tiers returned": (result) => Array.isArray(parseJson(result)?.tiers),
  });
}

export function awardScenario() {
  const memberId = memberIdentifier(__VU + __ITER, 1);
  const amountSpent = 20 + ((__ITER + __VU) % 80);
  const response = http.post(
    `${BASE}/points/award`,
    JSON.stringify({
      memberIdentifier: memberId,
      fallbackEmail: `${memberId.toLowerCase()}@example.com`,
      points: 0,
      transactionType: "PURCHASE",
      reason: "k6 purchase",
      amountSpent,
      productCode: `SKU-${(__ITER % 10) + 1}`,
      productCategory: "Beverage",
    }),
    {
      headers: jsonHeaders({ "Idempotency-Key": `k6-award-${__VU}-${__ITER}` }),
      tags: { endpoint: "points_award" },
    }
  );
  check(response, {
    "award status 200": (result) => result.status === 200,
    "award balance present": (result) => Number(parseJson(result)?.result?.newBalance) >= 0,
  });
}

export function redeemScenario() {
  const memberId = memberIdentifier(__VU + __ITER, 5);
  const response = http.post(
    `${BASE}/points/redeem`,
    JSON.stringify({
      memberIdentifier: memberId,
      fallbackEmail: `${memberId.toLowerCase()}@example.com`,
      points: 20,
      reason: "k6 reward",
    }),
    {
      headers: jsonHeaders({ "Idempotency-Key": `k6-redeem-${__VU}-${__ITER}` }),
      tags: { endpoint: "points_redeem" },
    }
  );
  check(response, {
    "redeem status 200": (result) => result.status === 200,
    "redeem balance present": (result) => Number(parseJson(result)?.result?.newBalance) >= 0,
  });
}

export function campaignScenario(data) {
  const listResponse = http.get(`${BASE}/campaigns`, {
    tags: { endpoint: "campaigns_list" },
  });
  check(listResponse, {
    "campaign list status 200": (result) => result.status === 200,
    "campaign list returned": (result) => Array.isArray(parseJson(result)?.campaigns),
  });

  const activeResponse = http.get(`${BASE}/campaigns/active`, {
    tags: { endpoint: "campaigns_active" },
  });
  check(activeResponse, {
    "campaign active status 200": (result) => result.status === 200,
  });

  if (data?.campaignId) {
    const budgetResponse = http.get(`${BASE}/campaigns/${data.campaignId}/budget-status`, {
      tags: { endpoint: "campaigns_budget_status" },
    });
    check(budgetResponse, {
      "budget status 200": (result) => result.status === 200,
      "budget payload returned": (result) => Boolean(parseJson(result)?.budgetStatus?.campaignId),
    });
  }
}
