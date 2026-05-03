import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createServer } from "../server.js";
import { getMemoryCampaign, resetMemoryCampaignStore } from "../repo.js";

async function jsonRequest(
  server: ReturnType<typeof createServer>,
  method: "GET" | "POST" | "PATCH",
  url: string,
  body?: unknown,
  headers?: Record<string, string>,
) {
  const response = await server.inject({
    method,
    url,
    payload: body as any,
    headers:
      body === undefined
        ? { ...(headers || {}) }
        : {
            "content-type": "application/json",
            ...(headers || {}),
          },
  });

  return {
    statusCode: response.statusCode,
    json: response.json(),
  };
}

describe("campaign-service integration coverage", () => {
  beforeEach(() => {
    resetMemoryCampaignStore(false);
    process.env.USE_LOCAL_LOYALTY_API = "true";
    process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH = "false";
  });

  it("covers draft to active to paused lifecycle and budget auto-pause", async (t) => {
    const server = createServer();
    t.after(async () => {
      await server.close();
    });

    const create = await jsonRequest(server, "POST", "/campaigns", {
      campaignCode: "CMP-LIFE",
      campaignName: "Lifecycle Campaign",
      campaignType: "multiplier_event",
      multiplier: 2,
      minimumPurchaseAmount: 0,
      startsAt: "2026-01-01T00:00:00.000Z",
      endsAt: "2026-12-31T23:59:59.000Z",
      budgetLimit: 40,
      autoPause: true,
      status: "draft",
    });
    assert.equal(create.statusCode, 200);
    const campaignId = create.json.campaign.id;
    assert.equal(create.json.campaign.status, "draft");

    const publish = await jsonRequest(server, "PATCH", `/campaigns/${campaignId}/publish`, {});
    assert.equal(publish.statusCode, 200);
    assert.equal(publish.json.campaign.status, "active");

    const assignOne = await jsonRequest(server, "POST", `/campaigns/${campaignId}/assign`, {
      memberIdentifier: "MEM-A",
    });
    const assignReplay = await jsonRequest(server, "POST", `/campaigns/${campaignId}/assign`, {
      memberIdentifier: "MEM-A",
    });
    assert.equal(assignOne.statusCode, 200);
    assert.equal(assignReplay.statusCode, 200);
    assert.equal(assignOne.json.assignment.variant, assignReplay.json.assignment.variant);

    const firstMultiplier = await jsonRequest(server, "POST", "/campaigns/multiplier", {
      memberIdentifier: "MEM-A",
      amountSpent: 20,
    });
    assert.equal(firstMultiplier.statusCode, 200);
    assert.equal(firstMultiplier.json.result.bonusPoints, 20);

    const secondMultiplier = await jsonRequest(server, "POST", "/campaigns/multiplier", {
      memberIdentifier: "MEM-B",
      amountSpent: 20,
    });
    assert.equal(secondMultiplier.statusCode, 200);
    assert.equal(secondMultiplier.json.result.bonusPoints, 20);

    const budgetStatus = await jsonRequest(server, "GET", `/campaigns/${campaignId}/budget-status`);
    assert.equal(budgetStatus.statusCode, 200);
    assert.equal(budgetStatus.json.budgetStatus.status, "paused");
    assert.equal(budgetStatus.json.budgetStatus.budgetRemaining, 0);
    assert.equal(budgetStatus.json.budgetStatus.active, false);

    const campaignList = await jsonRequest(server, "GET", "/campaigns");
    assert.equal(campaignList.statusCode, 200);
    assert.ok(campaignList.json.campaigns.some((campaign: { id: string }) => campaign.id === campaignId));

    const campaignDetail = await jsonRequest(server, "GET", `/campaigns/${campaignId}`);
    assert.equal(campaignDetail.statusCode, 200);
    assert.equal(campaignDetail.json.campaign.id, campaignId);

    const performance = await jsonRequest(server, "GET", "/campaigns/performance");
    assert.equal(performance.statusCode, 200);
    assert.ok(performance.json.performance.some((row: { campaign_id: string }) => row.campaign_id === campaignId));

    const notify = await jsonRequest(server, "POST", `/campaigns/${campaignId}/notify`, {});
    assert.equal(notify.statusCode, 200);
    assert.ok(notify.json.notificationsQueued >= 1);

    const pause = await jsonRequest(server, "PATCH", `/campaigns/${campaignId}/pause`, {});
    assert.equal(pause.statusCode, 200);
    assert.equal(pause.json.campaign.status, "paused");

    const activeCampaigns = await jsonRequest(server, "GET", "/campaigns/active");
    assert.equal(activeCampaigns.statusCode, 200);
    assert.equal(activeCampaigns.json.campaigns.length, 0);
  });

  it("declares an A/B winner through the service", async (t) => {
    const server = createServer();
    t.after(async () => {
      await server.close();
    });

    const create = await jsonRequest(server, "POST", "/campaigns", {
      campaignCode: "CMP-AB",
      campaignName: "Variant Test",
      campaignType: "multiplier_event",
      multiplier: 2,
      startsAt: "2026-01-01T00:00:00.000Z",
      endsAt: "2026-12-31T23:59:59.000Z",
      budgetLimit: 200,
      status: "active",
    });
    assert.equal(create.statusCode, 200);
    const campaignId = create.json.campaign.id;

    const winner = await jsonRequest(server, "POST", `/campaigns/${campaignId}/winner`, {
      scores: { A: 14, B: 19 },
    });
    assert.equal(winner.statusCode, 200);
    assert.equal(winner.json.result.winner, "B");
    assert.equal(winner.json.result.scores.B, 19);

    const stored = getMemoryCampaign(campaignId);
    assert.equal(stored?.winningVariant, "B");
    assert.ok(stored?.winnerDeclaredAt);
  });

  it("returns validation and not-found responses for invalid campaign requests", async (t) => {
    const server = createServer();
    t.after(async () => {
      await server.close();
    });

    const invalidCampaign = await jsonRequest(server, "POST", "/campaigns", {
      campaignCode: "",
      campaignName: "",
      campaignType: "multiplier_event",
      startsAt: "2026-12-31T23:59:59.000Z",
      endsAt: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(invalidCampaign.statusCode, 400);
    assert.equal(invalidCampaign.json.ok, false);

    const missingCampaign = await jsonRequest(server, "GET", "/campaigns/does-not-exist");
    assert.equal(missingCampaign.statusCode, 404);
    assert.equal(missingCampaign.json.ok, false);
  });
});
