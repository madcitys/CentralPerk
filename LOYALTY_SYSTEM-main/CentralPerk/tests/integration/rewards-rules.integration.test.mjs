import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateExpiryAdjustment,
  determineTierTransition,
  resolveMultiplierCampaigns,
} from "../../src/server/rewards-rules-core.mjs";

test("SCRUM-413: tier transition promotes a member once the Silver threshold is crossed", async () => {
  const result = determineTierTransition({
    startingBalance: 240,
    pointsDelta: 20,
    rules: [
      { tier_label: "Gold", min_points: 750 },
      { tier_label: "Silver", min_points: 250 },
      { tier_label: "Bronze", min_points: 0 },
    ],
  });

  assert.equal(result.previousTier, "Bronze");
  assert.equal(result.newTier, "Silver");
  assert.equal(result.newBalance, 260);
  assert.equal(result.changed, true);
});

test("SCRUM-413: points expiry logic only deducts the net expired earned balance", async () => {
  const result = calculateExpiryAdjustment({
    now: "2026-04-09T12:00:00.000Z",
    transactions: [
      { points: 200, transaction_type: "PURCHASE", expiry_date: "2026-04-01T00:00:00.000Z" },
      { points: 50, transaction_type: "EARN", expiry_date: "2026-05-01T00:00:00.000Z" },
      { points: -70, transaction_type: "EXPIRY_DEDUCTION", expiry_date: null },
    ],
  });

  assert.equal(result.expiredEarned, 200);
  assert.equal(result.alreadyDeducted, 70);
  assert.equal(result.totalExpired, 130);
});

test("SCRUM-413: points expiry never produces a negative deduction when expiry is already fully processed", async () => {
  const result = calculateExpiryAdjustment({
    now: "2026-04-09T12:00:00.000Z",
    transactions: [
      { points: 100, transaction_type: "PURCHASE", expiry_date: "2026-04-01T00:00:00.000Z" },
      { points: -120, transaction_type: "EXPIRY_DEDUCTION", expiry_date: null },
    ],
  });

  assert.equal(result.totalExpired, 0);
});

test("SCRUM-414: multiplier campaigns activate only when purchase window, tier, scope, and threshold match", async () => {
  const campaigns = resolveMultiplierCampaigns({
    now: "2026-04-09T12:00:00.000Z",
    purchaseAmount: 200,
    basePoints: 20,
    memberTier: "Gold",
    productScope: "beverage",
    campaigns: [
      {
        id: "cmp-weekend-2x",
        campaignName: "Double Points Weekend",
        campaignType: "multiplier_event",
        status: "active",
        multiplier: 2,
        minimumPurchaseAmount: 50,
        eligibleTiers: ["Gold"],
        productScope: ["beverage"],
        startsAt: "2026-04-08T00:00:00.000Z",
        endsAt: "2026-04-10T23:59:59.000Z",
      },
    ],
  });

  assert.equal(campaigns.length, 1);
  assert.equal(campaigns[0].campaignId, "cmp-weekend-2x");
  assert.equal(campaigns[0].awardedPoints, 20);
  assert.equal(campaigns[0].appliedMultiplier, 2);
});

test("SCRUM-414: multiplier campaigns stay inactive when the tier or product scope does not match", async () => {
  const campaigns = resolveMultiplierCampaigns({
    now: "2026-04-09T12:00:00.000Z",
    purchaseAmount: 200,
    basePoints: 20,
    memberTier: "Bronze",
    productScope: "food",
    campaigns: [
      {
        id: "cmp-weekend-2x",
        campaignName: "Double Points Weekend",
        campaignType: "multiplier_event",
        status: "active",
        multiplier: 2,
        minimumPurchaseAmount: 50,
        eligibleTiers: ["Gold"],
        productScope: ["beverage"],
        startsAt: "2026-04-08T00:00:00.000Z",
        endsAt: "2026-04-10T23:59:59.000Z",
      },
    ],
  });

  assert.equal(campaigns.length, 0);
});
