import assert from "node:assert/strict";
import { existsSync, rmSync } from "fs";
import path from "path";
import { describe, it } from "node:test";
import { MatchersV3, PactV3 } from "@pact-foundation/pact";
import { awardPoints, fetchTiers, redeemPoints, runExpiry } from "../../src/app/lib/points-service-client";

const { like, integer } = MatchersV3;
const pactFile = path.resolve(process.cwd(), "pacts/loyalty-frontend-points-engine.json");

if (existsSync(pactFile)) {
  rmSync(pactFile, { force: true });
}

function withPointsBaseUrl(url: string) {
  delete process.env.GATEWAY_URL;
  delete process.env.NEXT_PUBLIC_GATEWAY_URL;
  process.env.POINTS_ENGINE_URL = url;
}

describe("loyalty frontend -> points engine pact", () => {
  it("contracts the award endpoint", async () => {
    const provider = new PactV3({
      consumer: "loyalty-frontend",
      provider: "points-engine",
      dir: path.dirname(pactFile),
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
      .executeTest(async (mockServer) => {
        withPointsBaseUrl(mockServer.url);

        const response = await awardPoints(
          {
            memberIdentifier: "PACT-AWARD",
            fallbackEmail: "award@example.com",
            points: 100,
            transactionType: "MANUAL_AWARD",
            reason: "Pact award",
          },
          "pact-award-1"
        );

        assert.equal(response.ok, true);
        assert.equal(response.result.pointsAdded, 100);
      });
  });

  it("contracts the redeem endpoint", async () => {
    const provider = new PactV3({
      consumer: "loyalty-frontend",
      provider: "points-engine",
      dir: path.dirname(pactFile),
      logLevel: "warn",
    });

    await provider
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
        withPointsBaseUrl(mockServer.url);

        const response = await redeemPoints(
          {
            memberIdentifier: "PACT-REDEEM",
            fallbackEmail: "redeem@example.com",
            points: 100,
            reason: "Reward redemption",
          },
          "pact-redeem-1"
        );

        assert.equal(response.ok, true);
        assert.equal(response.result.pointsDeducted, 100);
      });
  });

  it("contracts the tiers lookup endpoint", async () => {
    const provider = new PactV3({
      consumer: "loyalty-frontend",
      provider: "points-engine",
      dir: path.dirname(pactFile),
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
      .executeTest(async (mockServer) => {
        withPointsBaseUrl(mockServer.url);

        const response = await fetchTiers();
        assert.equal(response.ok, true);
        assert.equal(response.tiers.length, 3);
      });
  });

  it("contracts the expiry endpoint", async () => {
    const provider = new PactV3({
      consumer: "loyalty-frontend",
      provider: "points-engine",
      dir: path.dirname(pactFile),
      logLevel: "warn",
    });

    await provider
      .given("an expiry run has expiring purchase points")
      .uponReceiving("an expiry run request from the loyalty frontend")
      .withRequest({
        method: "POST",
        path: "/points/expiry/run",
      })
      .willRespondWith({
        status: 200,
        body: {
          ok: true,
          result: {
            membersProcessed: integer(1),
            pointsExpired: integer(200),
          },
        },
      })
      .executeTest(async (mockServer) => {
        withPointsBaseUrl(mockServer.url);

        const response = await runExpiry();
        assert.equal(response.ok, true);
        assert.equal(response.result.pointsExpired, 200);
      });
  });
});
