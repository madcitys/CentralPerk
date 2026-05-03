import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { MatchersV3, PactV3 } from "@pact-foundation/pact";

import { loadCampaignBudgetStatus, publishCampaign, saveCampaign } from "../../src/app/lib/campaign-service-client";

const { integer, like } = MatchersV3;
const pactDir = path.resolve(process.cwd(), "pacts");

function withCampaignBaseUrl(url: string) {
  process.env.CAMPAIGN_SERVICE_URL = url;
  process.env.NEXT_PUBLIC_API_BASE_URL = url;
  process.env.NEXT_PUBLIC_GATEWAY_URL = url;
}

describe("loyalty frontend campaign contracts", () => {
  it("contracts create, publish, and budget status flows", async () => {
    const provider = new PactV3({
      consumer: "loyalty-frontend",
      provider: "campaign-service",
      dir: pactDir,
      logLevel: "warn",
    });

    await provider
      .given("campaigns can be created in draft")
      .uponReceiving("a campaign create request from the loyalty frontend")
      .withRequest({
        method: "POST",
        path: "/campaigns",
        headers: {
          "Content-Type": "application/json",
          "x-role": "admin",
        },
        body: {
          campaignCode: "CMP-PACT",
          campaignName: "Pact Campaign",
          campaignType: "multiplier_event",
          status: "draft",
          multiplier: 2,
          minimumPurchaseAmount: 0,
          startsAt: "2026-01-01T00:00:00.000Z",
          endsAt: "2026-12-31T23:59:59.000Z",
          budgetLimit: 1000,
          autoPause: true,
        },
      })
      .willRespondWith({
        status: 200,
        body: {
          ok: true,
          campaign: {
            id: like("cmp-pact"),
            campaignCode: like("CMP-PACT"),
            campaignName: like("Pact Campaign"),
            campaignType: like("multiplier_event"),
            status: like("draft"),
            budgetSpent: integer(0),
          },
        },
      })
      .given("a draft campaign can be published")
      .uponReceiving("a campaign publish request from the loyalty frontend")
      .withRequest({
        method: "PATCH",
        path: "/campaigns/cmp-pact/publish",
        headers: {
          "Content-Type": "application/json",
          "x-role": "admin",
        },
        body: {
          queueNotifications: false,
        },
      })
      .willRespondWith({
        status: 200,
        body: {
          ok: true,
          campaign: {
            id: like("cmp-pact"),
            status: like("active"),
          },
          notificationsQueued: integer(0),
        },
      })
      .given("a campaign budget status can be queried")
      .uponReceiving("a campaign budget status request from the loyalty frontend")
      .withRequest({
        method: "GET",
        path: "/campaigns/cmp-pact/budget-status",
      })
      .willRespondWith({
        status: 200,
        body: {
          ok: true,
          budgetStatus: {
            campaignId: like("cmp-pact"),
            status: like("active"),
            active: true,
            budgetLimit: integer(1000),
            budgetSpent: integer(200),
            budgetRemaining: integer(800),
            utilizationPercent: integer(20),
          },
        },
      })
      .executeTest(async (mockServer) => {
        withCampaignBaseUrl(mockServer.url);

        const created = await saveCampaign({
          campaignCode: "CMP-PACT",
          campaignName: "Pact Campaign",
          campaignType: "multiplier_event",
          status: "draft",
          multiplier: 2,
          minimumPurchaseAmount: 0,
          startsAt: "2026-01-01T00:00:00.000Z",
          endsAt: "2026-12-31T23:59:59.000Z",
          budgetLimit: 1000,
          autoPause: true,
        });
        assert.equal(created.ok, true);
        assert.equal(created.campaign.status, "draft");

        const published = await publishCampaign("cmp-pact", { queueNotifications: false });
        assert.equal(published.ok, true);
        assert.equal(published.campaign.status, "active");

        const budgetStatus = await loadCampaignBudgetStatus("cmp-pact");
        assert.equal(budgetStatus.ok, true);
        assert.equal(budgetStatus.budgetStatus.budgetRemaining, 800);
      });
  });
});
