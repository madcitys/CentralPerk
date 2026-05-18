import test from "node:test";
import assert from "node:assert/strict";

import { createPointsApi } from "../../src/server/api/points-core.mjs";

test("SCRUM-412: award flow writes once and replays duplicate request by idempotency key", async () => {
  const calls = [];
  const pointsApi = createPointsApi({
    async awardMemberPoints(payload) {
      calls.push(payload);
      return {
        newBalance: 330,
        newTier: "Silver",
        pointsAdded: 30,
        bonusPointsAdded: 10,
        appliedCampaigns: [
          {
            campaign_id: "cmp-weekend-2x",
            campaign_name: "Double Points Weekend",
            campaign_type: "multiplier_event",
            awarded_points: 10,
            applied_multiplier: 2,
            minimum_purchase_amount: 50,
          },
        ],
      };
    },
    async redeemMemberPoints() {
      throw new Error("redeem should not be called");
    },
    async findAwardByIdempotencyKey(idempotencyKey) {
      if (idempotencyKey === "award-dup-1" && calls.length > 0) {
        return {
          newBalance: 330,
          newTier: "Silver",
          pointsAdded: 30,
          bonusPointsAdded: 10,
          appliedCampaigns: [],
        };
      }
      return null;
    },
    async findRedeemByIdempotencyKey() {
      return null;
    },
  });

  const first = await pointsApi.award({
    memberIdentifier: "MEM-000001",
    fallbackEmail: "john@example.com",
    points: 0,
    transactionType: "PURCHASE",
    reason: "Iced latte order",
    amountSpent: 125.5,
    productCode: "LATTE-ICED",
    productCategory: "beverage",
    idempotencyKey: "award-dup-1",
  });

  const duplicate = await pointsApi.award({
    memberIdentifier: "MEM-000001",
    fallbackEmail: "john@example.com",
    points: 0,
    transactionType: "PURCHASE",
    reason: "Iced latte order",
    amountSpent: 125.5,
    productCode: "LATTE-ICED",
    productCategory: "beverage",
    idempotencyKey: "award-dup-1",
  });

  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].idempotencyKey, "award-dup-1");
});

test("SCRUM-412: redeem flow writes once and blocks duplicate redemption replay", async () => {
  const calls = [];
  const pointsApi = createPointsApi({
    async awardMemberPoints() {
      throw new Error("award should not be called");
    },
    async redeemMemberPoints(payload) {
      calls.push(payload);
      return {
        newBalance: 180,
        newTier: "Bronze",
        pointsDeducted: 120,
      };
    },
    async findAwardByIdempotencyKey() {
      return null;
    },
    async findRedeemByIdempotencyKey(idempotencyKey) {
      if (idempotencyKey === "redeem-dup-1" && calls.length > 0) {
        return {
          newBalance: 180,
          newTier: "Bronze",
          pointsDeducted: 120,
        };
      }
      return null;
    },
  });

  const first = await pointsApi.redeem({
    memberIdentifier: "MEM-000001",
    fallbackEmail: "john@example.com",
    points: 120,
    reason: "Reward redemption",
    transactionType: "REDEEM",
    rewardCatalogId: 9,
    idempotencyKey: "redeem-dup-1",
  });

  const duplicate = await pointsApi.redeem({
    memberIdentifier: "MEM-000001",
    fallbackEmail: "john@example.com",
    points: 120,
    reason: "Reward redemption",
    transactionType: "REDEEM",
    rewardCatalogId: 9,
    idempotencyKey: "redeem-dup-1",
  });

  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].idempotencyKey, "redeem-dup-1");
});

test("SCRUM-412: invalid points writes are rejected before the redeem integration runs", async () => {
  const pointsApi = createPointsApi({
    async awardMemberPoints() {
      throw new Error("award should not be called");
    },
    async redeemMemberPoints() {
      throw new Error("redeem should not be called");
    },
    async findAwardByIdempotencyKey() {
      return null;
    },
    async findRedeemByIdempotencyKey() {
      return null;
    },
  });

  await assert.rejects(
    () =>
      pointsApi.redeem({
        memberIdentifier: "MEM-000001",
        points: 0,
        reason: "Invalid redemption",
      }),
    /points must be greater than zero/i
  );
});
