import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { MatchersV3, PactV3 } from "@pact-foundation/pact";

import { awardPoints, fetchTiers, redeemPoints } from "../../src/app/lib/points-service-client";

const { integer, like } = MatchersV3;
const pactDir = path.resolve(process.cwd(), "pacts");

function withConsumerBaseUrl(url: string) {
  process.env.NEXT_PUBLIC_API_BASE_URL = url;
  process.env.NEXT_PUBLIC_GATEWAY_URL = url;
  process.env.POINTS_ENGINE_URL = url;
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  return response.json();
}

describe("loyalty frontend points contracts", () => {
  it("contracts award and redeem point flows", async () => {
    const provider = new PactV3({
      consumer: "loyalty-frontend",
      provider: "points-engine",
      dir: pactDir,
      logLevel: "warn",
    });

    await provider
      .given("a member can receive awarded points")
      .uponReceiving("an award points request from the loyalty frontend")
      .withRequest({
        method: "POST",
        path: "/points/award",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "pact-award-1",
        },
        body: {
          memberIdentifier: "PACT-AWARD",
          fallbackEmail: "award@example.com",
          points: 100,
          transactionType: "MANUAL_AWARD",
          reason: "Pact award",
        },
      })
      .willRespondWith({
        status: 200,
        body: {
          ok: true,
          result: {
            newBalance: integer(100),
            newTier: like("Bronze"),
            pointsAdded: integer(100),
            ledgerEntry: {
              member_id: integer(1),
              change_type: like("MANUAL_AWARD"),
              points_delta: integer(100),
            },
          },
        },
      })
      .given("a member has redeemable points")
      .uponReceiving("a redeem points request from the loyalty frontend")
      .withRequest({
        method: "POST",
        path: "/points/redeem",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "pact-redeem-1",
        },
        body: {
          memberIdentifier: "PACT-REDEEM",
          fallbackEmail: "redeem@example.com",
          points: 100,
          reason: "Reward redemption",
        },
      })
      .willRespondWith({
        status: 200,
        body: {
          ok: true,
          result: {
            newBalance: integer(500),
            newTier: like("Silver"),
            pointsDeducted: integer(100),
            ledgerEntry: {
              member_id: integer(1),
              change_type: like("REDEEM"),
              points_delta: integer(-100),
            },
          },
        },
      })
      .executeTest(async (mockServer) => {
        withConsumerBaseUrl(mockServer.url);

        const awardResponse = await awardPoints(
          {
            memberIdentifier: "PACT-AWARD",
            fallbackEmail: "award@example.com",
            points: 100,
            transactionType: "MANUAL_AWARD",
            reason: "Pact award",
          },
          "pact-award-1",
        );
        assert.equal(awardResponse.ok, true);
        assert.equal(awardResponse.result.pointsAdded, 100);

        const redeemResponse = await redeemPoints(
          {
            memberIdentifier: "PACT-REDEEM",
            fallbackEmail: "redeem@example.com",
            points: 100,
            reason: "Reward redemption",
          },
          "pact-redeem-1",
        );
        assert.equal(redeemResponse.ok, true);
        assert.equal(redeemResponse.result.pointsDeducted, 100);
      });
  });

  it("contracts points tiers, member balance, and member tier reads", async () => {
    const provider = new PactV3({
      consumer: "loyalty-frontend",
      provider: "points-engine",
      dir: pactDir,
      logLevel: "warn",
    });

    await provider
      .given("points tiers are available")
      .uponReceiving("a tier lookup request from the loyalty frontend")
      .withRequest({
        method: "GET",
        path: "/points/tiers",
      })
      .willRespondWith({
        status: 200,
        body: {
          ok: true,
          tiers: [
            { tier_label: like("Gold"), min_points: integer(750), is_active: true },
            { tier_label: like("Silver"), min_points: integer(250), is_active: true },
            { tier_label: like("Bronze"), min_points: integer(0), is_active: true },
          ],
        },
      })
      .given("member points can be queried from the loyalty frontend")
      .uponReceiving("a member points lookup request")
      .withRequest({
        method: "GET",
        path: "/members/MEM-000001/points",
        query: {
          email: "john@example.com",
        },
      })
      .willRespondWith({
        status: 200,
        body: {
          ok: true,
          memberId: like("MEM-000001"),
          points: integer(420),
          balance: {
            member_id: like("MEM-000001"),
            points_balance: integer(420),
            tier: like("Silver"),
          },
        },
      })
      .given("member tiers can be queried from the loyalty frontend")
      .uponReceiving("a member tier lookup request")
      .withRequest({
        method: "GET",
        path: "/members/MEM-000001/tier",
        query: {
          email: "john@example.com",
        },
      })
      .willRespondWith({
        status: 200,
        body: {
          ok: true,
          memberId: like("MEM-000001"),
          tier: like("Silver"),
        },
      })
      .executeTest(async (mockServer) => {
        withConsumerBaseUrl(mockServer.url);

        const tiers = await fetchTiers();
        assert.equal(tiers.ok, true);
        assert.equal(tiers.tiers.length, 3);

        const balance = await fetchJson(`${mockServer.url}/members/MEM-000001/points?email=john@example.com`) as {
          ok: boolean;
          memberId: string;
          points: number;
          balance: { member_id: string; points_balance: number; tier: string };
        };
        assert.equal(balance.ok, true);
        assert.equal(balance.points, 420);

        const tier = await fetchJson(`${mockServer.url}/members/MEM-000001/tier?email=john@example.com`) as {
          ok: boolean;
          memberId: string;
          tier: string;
        };
        assert.equal(tier.ok, true);
        assert.equal(tier.tier, "Silver");
      });
  });
});
