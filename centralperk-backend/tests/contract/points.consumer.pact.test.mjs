import test from "node:test";
import assert from "node:assert/strict";
import { PactV3, MatchersV3 } from "@pact-foundation/pact";

import { LoyaltyApiClient } from "./support/loyalty-api-client.mjs";

const { like, eachLike, integer, decimal, regex, timestamp } = MatchersV3;

const provider = new PactV3({
  consumer: "centralperk-web",
  provider: "points-engine-api",
  dir: "tests/contract/pacts",
});

test("SCRUM-401: award points contract covers purchase earn flow", async () => {
  provider
    .given("member MEM-000001 exists and is eligible for a purchase award")
    .uponReceiving("a purchase points award request")
    .withRequest({
      method: "POST",
      path: "/api/points/award",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: {
        memberIdentifier: "MEM-000001",
        fallbackEmail: "john@example.com",
        transactionType: "PURCHASE",
        reason: "Iced latte order",
        amountSpent: decimal(125.5),
        productCode: "LATTE-ICED",
        productCategory: "beverage",
        points: integer(0),
      },
    })
    .willRespondWith({
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: {
        newBalance: integer(420),
        newTier: regex("Bronze|Silver|Gold", "Silver"),
        pointsAdded: integer(30),
        bonusPointsAdded: integer(10),
        appliedCampaigns: eachLike({
          campaign_id: like("campaign-weekend-2x"),
          campaign_name: like("Double Points Weekend"),
          campaign_type: regex("bonus_points|multiplier_event", "multiplier_event"),
          awarded_points: integer(10),
          applied_multiplier: like(2),
          minimum_purchase_amount: like(50),
        }),
      },
    });

  await provider.executeTest(async (mockServer) => {
    const client = new LoyaltyApiClient(mockServer.url);
    const response = await client.awardPoints({
      memberIdentifier: "MEM-000001",
      fallbackEmail: "john@example.com",
      transactionType: "PURCHASE",
      reason: "Iced latte order",
      amountSpent: 125.5,
      productCode: "LATTE-ICED",
      productCategory: "beverage",
      points: 0,
    });

    assert.equal(response.newTier, "Silver");
    assert.equal(response.pointsAdded, 30);
    assert.equal(response.appliedCampaigns[0].campaign_type, "multiplier_event");
  });
});

test("SCRUM-401: redeem points contract covers redemption and idempotent ledger response", async () => {
  provider
    .given("member MEM-000001 has enough points for redemption")
    .uponReceiving("a reward redemption request")
    .withRequest({
      method: "POST",
      path: "/api/points/redeem",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: {
        memberIdentifier: "MEM-000001",
        fallbackEmail: "john@example.com",
        points: integer(120),
        reason: "Free Regular Coffee Redemption",
        transactionType: "REDEEM",
        rewardCatalogId: integer(9),
        idempotencyKey: like("redeem-MEM-000001-2026-04-08T10:30"),
      },
    })
    .willRespondWith({
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: {
        newBalance: integer(300),
        newTier: regex("Bronze|Silver|Gold", "Silver"),
        pointsDeducted: integer(120),
        ledgerEntryId: integer(9901),
        idempotencyKey: like("redeem-MEM-000001-2026-04-08T10:30"),
        processedAt: timestamp("yyyy-MM-dd'T'HH:mm:ss.SSSX", "2026-04-08T10:30:00.000Z"),
      },
    });

  await provider.executeTest(async (mockServer) => {
    const client = new LoyaltyApiClient(mockServer.url);
    const response = await client.redeemPoints({
      memberIdentifier: "MEM-000001",
      fallbackEmail: "john@example.com",
      points: 120,
      reason: "Free Regular Coffee Redemption",
      transactionType: "REDEEM",
      rewardCatalogId: 9,
      idempotencyKey: "redeem-MEM-000001-2026-04-08T10:30",
    });

    assert.equal(response.pointsDeducted, 120);
    assert.equal(response.idempotencyKey, "redeem-MEM-000001-2026-04-08T10:30");
  });
});
