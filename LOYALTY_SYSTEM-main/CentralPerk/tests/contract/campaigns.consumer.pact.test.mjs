import test from "node:test";
import assert from "node:assert/strict";
import { PactV3, MatchersV3 } from "@pact-foundation/pact";

import { LoyaltyApiClient } from "./support/loyalty-api-client.mjs";

const { like, eachLike, integer, decimal, regex, timestamp } = MatchersV3;

const provider = new PactV3({
  consumer: "centralperk-web",
  provider: "campaign-service-api",
  dir: "tests/contract/pacts",
});

test("SCRUM-402: campaign contract resolves purchase bonuses and multiplier events", async () => {
  provider
    .given("active bonus and multiplier campaigns exist for beverage purchases")
    .uponReceiving("a purchase campaign resolution request")
    .withRequest({
      method: "POST",
      path: "/api/campaigns/resolve-purchase",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: {
        memberId: integer(1),
        purchaseAmount: decimal(180.5),
        basePoints: integer(18),
        memberTier: regex("Bronze|Silver|Gold", "Gold"),
        productScope: like("beverage"),
      },
    })
    .willRespondWith({
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: {
        campaignCount: integer(2),
        totalAwardedPoints: integer(36),
        campaigns: eachLike({
          campaignId: like("cmp-weekend-2x"),
          campaignName: like("Double Points Weekend"),
          campaignType: regex("bonus_points|multiplier_event", "multiplier_event"),
          awardedPoints: integer(18),
          appliedMultiplier: like(2),
          minimumPurchaseAmount: like(50),
          startsAt: timestamp("yyyy-MM-dd'T'HH:mm:ss.SSSX", "2026-04-08T00:00:00.000Z"),
          endsAt: timestamp("yyyy-MM-dd'T'HH:mm:ss.SSSX", "2026-04-10T23:59:59.000Z"),
        }),
      },
    });

  await provider.executeTest(async (mockServer) => {
    const client = new LoyaltyApiClient(mockServer.url);
    const response = await client.resolvePurchaseCampaigns({
      memberId: 1,
      purchaseAmount: 180.5,
      basePoints: 18,
      memberTier: "Gold",
      productScope: "beverage",
    });

    assert.equal(response.campaignCount, 2);
    assert.ok(response.totalAwardedPoints >= 18);
    assert.equal(response.campaigns[0].campaignType, "multiplier_event");
  });
});

test("SCRUM-402: flash sale claim contract returns live inventory counts", async () => {
  provider
    .given("an active flash sale still has quantity remaining")
    .uponReceiving("a flash sale claim request")
    .withRequest({
      method: "POST",
      path: "/api/campaigns/flash-sale/claim",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: {
        campaignId: like("cmp-grab-flash"),
        memberId: integer(1),
        rewardCatalogId: integer(9),
      },
    })
    .willRespondWith({
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: {
        campaignId: like("cmp-grab-flash"),
        claimedCount: integer(41),
        quantityLimit: integer(100),
        endsAt: timestamp("yyyy-MM-dd'T'HH:mm:ss.SSSX", "2026-04-08T23:59:59.000Z"),
        status: regex("scheduled|active|completed", "active"),
      },
    });

  await provider.executeTest(async (mockServer) => {
    const client = new LoyaltyApiClient(mockServer.url);
    const response = await client.claimFlashSale({
      campaignId: "cmp-grab-flash",
      memberId: 1,
      rewardCatalogId: 9,
    });

    assert.equal(response.campaignId, "cmp-grab-flash");
    assert.equal(response.quantityLimit, 100);
    assert.ok(response.claimedCount > 0);
  });
});
