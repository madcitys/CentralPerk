import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "fs";
import path from "path";
import { describe, it } from "node:test";
import { MatchersV3, PactV3 } from "@pact-foundation/pact";
import { awardPoints } from "../../src/app/lib/points-service-client";

const { integer, like } = MatchersV3;
const brokenDir = path.resolve(process.cwd(), "pacts/breaking");
const pactFile = path.resolve(brokenDir, "loyalty-frontend-breaking-points-engine.json");

mkdirSync(brokenDir, { recursive: true });
rmSync(pactFile, { force: true });

describe("intentional breaking pact", () => {
  it("generates a contract the provider should reject", async () => {
    const provider = new PactV3({
      consumer: "loyalty-frontend-breaking",
      provider: "points-engine",
      dir: brokenDir,
      logLevel: "warn",
    });

    await provider
      .given("a member can receive awarded points")
      .uponReceiving("a breaking award request from the loyalty frontend")
      .withRequest({
        method: "POST",
        path: "/points/award",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "pact-award-breaking-1",
        },
        body: {
          memberIdentifier: "PACT-AWARD",
          fallbackEmail: "award@example.com",
          points: 100,
          transactionType: "MANUAL_AWARD",
          reason: "Breaking Pact award",
        },
      })
      .willRespondWith({
        status: 200,
        body: {
          ok: true,
          result: {
            currentBalance: integer(100),
            currentTier: like("Bronze"),
          },
        },
      })
      .executeTest(async (mockServer) => {
        delete process.env.GATEWAY_URL;
        delete process.env.NEXT_PUBLIC_GATEWAY_URL;
        process.env.POINTS_ENGINE_URL = mockServer.url;

        const response = await awardPoints(
          {
            memberIdentifier: "PACT-AWARD",
            fallbackEmail: "award@example.com",
            points: 100,
            transactionType: "MANUAL_AWARD",
            reason: "Breaking Pact award",
          },
          "pact-award-breaking-1"
        );

        assert.equal(response.ok, true);
        assert.equal(response.result.currentBalance, 100);
      });
  });
});
