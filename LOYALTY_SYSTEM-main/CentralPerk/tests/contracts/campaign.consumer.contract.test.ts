import assert from "node:assert/strict";
import { existsSync, rmSync } from "fs";
import path from "path";
import { describe, it } from "node:test";
import { MatchersV3, PactV3 } from "@pact-foundation/pact";
import {
  listActiveCampaigns,
  listCampaigns,
  loadCampaignBudgetStatus,
  publishCampaign,
  saveCampaign,
} from "../../src/app/lib/campaign-service-client";

const { like, integer } = MatchersV3;
const pactFile = path.resolve(process.cwd(), "pacts/loyalty-frontend-campaign-service.json");

if (existsSync(pactFile)) {
  rmSync(pactFile, { force: true });
}

function withCampaignBaseUrl(url: string) {
  delete process.env.GATEWAY_URL;
  delete process.env.NEXT_PUBLIC_GATEWAY_URL;
  process.env.CAMPAIGN_SERVICE_URL = url;
  process.env.ADMIN_ROLE = "admin";
}

describe("loyalty frontend -> campaign service pact", () => {
  it("contracts the campaigns list endpoint", async () => {
    const provider = new PactV3({
      consumer: "loyalty-frontend",
      provider: "campaign-service",
      dir: path.dirname(pactFile),
      logLevel: "warn",
    });

    await provider
      .given("campaign collection exists")
      .uponReceiving("a campaigns list request from the loyalty frontend")
      .withRequest({
        method: "GET",
        path: "/campaigns",
      })
      .willRespondWith({
        status: 200,
        body: {
          ok: true,
          campaigns: [
            {
              id: like("cmp-list"),
              campaignCode: like("CMP-LIST"),
              campaignName: like("Collection Campaign"),
              campaignType: like("multiplier_event"),
              status: like("draft"),
            },
          ],
        },
      })
      .executeTest(async (mockServer) => {
        withCampaignBaseUrl(mockServer.url);

        const response = await listCampaigns();
        assert.equal(response.ok, true);
        assert.equal(response.campaigns.length, 1);
      });
  });

  it("contracts the active campaigns endpoint", async () => {
    const provider = new PactV3({
      consumer: "loyalty-frontend",
      provider: "campaign-service",
      dir: path.dirname(pactFile),
      logLevel: "warn",
    });

    await provider
      .given("an active campaign is available")
      .uponReceiving("an active campaigns request from the loyalty frontend")
      .withRequest({
        method: "GET",
        path: "/campaigns/active",
      })
      .willRespondWith({
        status: 200,
        body: {
          ok: true,
          campaigns: [
            {
              id: like("cmp-active"),
              campaignCode: like("CMP-ACTIVE"),
              campaignName: like("Active Campaign"),
              campaignType: like("multiplier_event"),
              status: like("active"),
              multiplier: integer(2),
            },
          ],
        },
      })
      .executeTest(async (mockServer) => {
        withCampaignBaseUrl(mockServer.url);

        const response = await listActiveCampaigns();
        assert.equal(response.ok, true);
        assert.equal(response.campaigns[0].status, "active");
      });
  });

  it("contracts the campaign save endpoint", async () => {
    const provider = new PactV3({
      consumer: "loyalty-frontend",
      provider: "campaign-service",
      dir: path.dirname(pactFile),
      logLevel: "warn",
    });

    await provider
      .given("a campaign can be created")
      .uponReceiving("a campaign save request from the loyalty frontend")
      .withRequest({
        method: "POST",
        path: "/campaigns",
        headers: {
          "Content-Type": "application/json",
          "x-role": "admin",
        },
        body: {
          campaignCode: "CMP-CREATE",
          campaignName: "Created Campaign",
          campaignType: "multiplier_event",
          startsAt: "2026-01-01T00:00:00.000Z",
          endsAt: "2026-12-31T23:59:59.000Z",
        },
      })
      .willRespondWith({
        status: 200,
        body: {
          ok: true,
          campaign: {
            id: like("cmp-created"),
            campaignCode: like("CMP-CREATE"),
            campaignName: like("Created Campaign"),
            status: like("draft"),
          },
        },
      })
      .executeTest(async (mockServer) => {
        withCampaignBaseUrl(mockServer.url);

        const response = await saveCampaign({
          campaignCode: "CMP-CREATE",
          campaignName: "Created Campaign",
          campaignType: "multiplier_event",
          startsAt: "2026-01-01T00:00:00.000Z",
          endsAt: "2026-12-31T23:59:59.000Z",
        });

        assert.equal(response.ok, true);
        assert.equal(response.campaign.campaignCode, "CMP-CREATE");
      });
  });

  it("contracts the campaign publish endpoint", async () => {
    const provider = new PactV3({
      consumer: "loyalty-frontend",
      provider: "campaign-service",
      dir: path.dirname(pactFile),
      logLevel: "warn",
    });

    await provider
      .given("a draft campaign can be published")
      .uponReceiving("a campaign publish request from the loyalty frontend")
      .withRequest({
        method: "PATCH",
        path: "/campaigns/cmp-publish/publish",
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
            id: like("cmp-publish"),
            campaignCode: like("CMP-PUBLISH"),
            campaignName: like("Publishable Campaign"),
            status: like("active"),
          },
          notificationsQueued: integer(0),
        },
      })
      .executeTest(async (mockServer) => {
        withCampaignBaseUrl(mockServer.url);

        const response = await publishCampaign("cmp-publish", { queueNotifications: false });
        assert.equal(response.ok, true);
        assert.equal(response.campaign.status, "active");
      });
  });

  it("contracts the budget status endpoint", async () => {
    const provider = new PactV3({
      consumer: "loyalty-frontend",
      provider: "campaign-service",
      dir: path.dirname(pactFile),
      logLevel: "warn",
    });

    await provider
      .given("a campaign budget status is available")
      .uponReceiving("a budget status request from the loyalty frontend")
      .withRequest({
        method: "GET",
        path: "/campaigns/cmp-budget/budget-status",
      })
      .willRespondWith({
        status: 200,
        body: {
          ok: true,
          budgetStatus: {
            campaignId: like("cmp-budget"),
            status: like("active"),
            budgetLimit: integer(120),
            budgetSpent: integer(0),
            budgetRemaining: integer(120),
            utilizationPercent: integer(0),
          },
        },
      })
      .executeTest(async (mockServer) => {
        withCampaignBaseUrl(mockServer.url);

        const response = await loadCampaignBudgetStatus("cmp-budget");
        assert.equal(response.ok, true);
        assert.equal(response.budgetStatus.campaignId, "cmp-budget");
      });
  });
});
