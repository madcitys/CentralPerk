import http from "k6/http";
import { check, sleep } from "k6";

const BASE = (__ENV.GATEWAY_URL || "http://127.0.0.1:4000").replace(/\/+$/, "");
const ADMIN_ROLE = __ENV.ADMIN_ROLE || "admin";
const SEED_MEMBER_COUNT = Number(__ENV.LOYALTY_K6_MEMBER_COUNT || 20);

export const options = {
  stages: [
    { duration: "30s", target: 80 },
    { duration: "2m", target: 80 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.001"],
    "http_req_duration{endpoint:points_award}": ["p(95)<300"],
    "http_req_duration{endpoint:points_redeem}": ["p(95)<500"],
    "http_req_duration{endpoint:member_points}": ["p(95)<400"],
    "http_req_duration{endpoint:campaigns_list}": ["p(95)<400"],
    "http_req_duration{endpoint:program_health}": ["p(95)<450"],
    "http_req_duration{endpoint:member_notifications}": ["p(95)<450"],
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

function memberEmail(memberId) {
  return `${memberId.toLowerCase()}@example.com`;
}

function parseJson(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

function summaryDir() {
  return __ENV.K6_SUMMARY_DIR || "centralperk-backend/gateway/load-test/results";
}

export function handleSummary(data) {
  const totalRequests = data.metrics?.http_reqs?.values?.count ?? 0;
  const failureRate = data.metrics?.http_req_failed?.values?.rate ?? 0;
  const p95Duration = data.metrics?.http_req_duration?.values?.["p(95)"] ?? 0;
  const text = [
    "CentralPerk loyalty load summary",
    `total requests: ${totalRequests}`,
    `failure rate: ${failureRate}`,
    `p95 duration: ${p95Duration}`,
  ].join("\n");

  return {
    [`${summaryDir()}/summary.json`]: JSON.stringify(data, null, 2),
    [`${summaryDir()}/summary.txt`]: text,
    stdout: text,
  };
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
      },
    );
    check(publishCampaign, { "setup campaign published": (response) => response.status === 200 });
  }

  for (let index = 1; index <= SEED_MEMBER_COUNT; index += 1) {
    const memberId = memberIdentifier(index, 0);
    const response = http.post(
      `${BASE}/points/award`,
      JSON.stringify({
        memberIdentifier: memberId,
        fallbackEmail: memberEmail(memberId),
        points: 1000,
        transactionType: "MANUAL_AWARD",
        reason: "k6 seed balance",
      }),
      {
        headers: jsonHeaders({ "Idempotency-Key": `k6-seed-${memberId}` }),
        tags: { phase: "setup", endpoint: "points_award_seed" },
      },
    );
    check(response, { "setup member funded": (result) => result.status === 200 });
  }

  return { campaignId };
}

function awardScenario() {
  const memberId = memberIdentifier(__VU + __ITER, 1);
  const amountSpent = 50 + ((__ITER + __VU) % 250);
  const response = http.post(
    `${BASE}/points/award`,
    JSON.stringify({
      memberIdentifier: memberId,
      fallbackEmail: memberEmail(memberId),
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
    },
  );
  check(response, {
    "award status 200": (result) => result.status === 200,
    "award balance present": (result) => Number(parseJson(result)?.result?.newBalance) >= 0,
  });
}

function redeemScenario() {
  const memberId = memberIdentifier(__VU + __ITER, 5);
  const response = http.post(
    `${BASE}/points/redeem`,
    JSON.stringify({
      memberIdentifier: memberId,
      fallbackEmail: memberEmail(memberId),
      points: 20,
      reason: "k6 reward",
    }),
    {
      headers: jsonHeaders({ "Idempotency-Key": `k6-redeem-${__VU}-${__ITER}` }),
      tags: { endpoint: "points_redeem" },
    },
  );
  check(response, {
    "redeem status 200 or 422": (result) => result.status === 200 || result.status === 422,
    "redeem response shaped": (result) => Boolean(parseJson(result)?.ok) === true || parseJson(result)?.code === "INSUFFICIENT_POINTS",
  });
}

function memberPointsScenario() {
  const memberId = memberIdentifier(__VU + __ITER, 2);
  const response = http.get(`${BASE}/members/${memberId}/points?email=${encodeURIComponent(memberEmail(memberId))}`, {
    tags: { endpoint: "member_points" },
  });
  check(response, {
    "member points status 200": (result) => result.status === 200,
    "member points returned": (result) => Number(parseJson(result)?.points) >= 0,
  });
}

function campaignsScenario() {
  const response = http.get(`${BASE}/campaigns`, {
    tags: { endpoint: "campaigns_list" },
  });
  check(response, {
    "campaign list status 200": (result) => result.status === 200,
    "campaign list returned": (result) => Array.isArray(parseJson(result)?.campaigns),
  });
}

function programHealthScenario() {
  const response = http.get(`${BASE}/analytics/program-health`, {
    tags: { endpoint: "program_health" },
  });
  check(response, {
    "program health status 200": (result) => result.status === 200,
    "program health returned": (result) => typeof parseJson(result)?.status === "string",
  });
}

function memberNotificationsScenario() {
  const memberId = memberIdentifier(__VU + __ITER, 3);
  const response = http.get(
    `${BASE}/members/${memberId}/notifications?email=${encodeURIComponent(memberEmail(memberId))}&limit=20`,
    {
      tags: { endpoint: "member_notifications" },
    },
  );
  check(response, {
    "member notifications status 200": (result) => result.status === 200,
    "member notifications returned": (result) => Array.isArray(parseJson(result)?.notifications),
  });
}

export default function () {
  const pick = Math.random();

  if (pick < 0.4) {
    awardScenario();
  } else if (pick < 0.55) {
    redeemScenario();
  } else if (pick < 0.7) {
    memberPointsScenario();
  } else if (pick < 0.8) {
    campaignsScenario();
  } else if (pick < 0.9) {
    programHealthScenario();
  } else {
    memberNotificationsScenario();
  }

  sleep(1);
}
