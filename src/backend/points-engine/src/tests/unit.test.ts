import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { awardPoints, calculatePurchasePoints, normalizeTierRules, redeemPoints, runExpiry } from "../core/engine.js";
import type { PointsRepository } from "../core/repo.js";
import type { ExpiryResult, Member, TierRule } from "../core/types.js";

const rules: TierRule[] = [
  { tier_label: "Gold", min_points: 750 },
  { tier_label: "Silver", min_points: 250 },
  { tier_label: "Bronze", min_points: 0 },
];

function makeRepo(initialBalance = 0) {
  let member: Member = {
    id: 1,
    member_number: "M-1",
    email: "a@example.com",
    points_balance: initialBalance,
    tier: "Bronze",
  };
  let lastExpiry: ExpiryResult = { membersProcessed: 0, pointsExpired: 0 };

  const repo: PointsRepository = {
    async findMember() {
      return member;
    },
    async fetchTierRules() {
      return rules;
    },
    async insertAward(_member, input, newBalance, newTier) {
      member = { ...member, points_balance: newBalance, tier: newTier as Member["tier"] };
      return { member_id: member.id, change_type: input.transactionType, points_delta: input.points };
    },
    async insertRedemption(_member, input, newBalance, newTier) {
      member = { ...member, points_balance: newBalance, tier: newTier as Member["tier"] };
      return { member_id: member.id, change_type: input.transactionType ?? "REDEEM", points_delta: -input.points };
    },
    async runExpiryJob() {
      return lastExpiry;
    },
  };

  return {
    repo,
    setExpiry(result: ExpiryResult) {
      lastExpiry = result;
    },
  };
}

describe("points-engine unit coverage", () => {
  beforeEach(() => {
    // Keeps the suite explicit if more shared state gets added later.
  });

  it("normalizes tier rules and preserves a Bronze fallback", () => {
    const normalized = normalizeTierRules([
      { tier_label: "gold", min_points: 750 } as unknown as TierRule,
      { tier_label: "silver", min_points: 250 } as unknown as TierRule,
    ]);

    assert.deepEqual(
      normalized.map((rule) => `${rule.tier_label}:${rule.min_points}`),
      ["Gold:750", "Silver:250", "Bronze:0"]
    );
  });

  it("calculates purchase points from whole currency units", () => {
    assert.equal(calculatePurchasePoints(123.99), 123);
    assert.equal(calculatePurchasePoints(-10), 0);
  });

  it("awards points and upgrades the member tier", async () => {
    const { repo } = makeRepo(0);

    const result = await awardPoints(repo, {
      memberIdentifier: "M-1",
      points: 500,
      transactionType: "MANUAL_AWARD",
      reason: "test",
    });

    assert.equal(result.newBalance, 500);
    assert.equal(result.newTier, "Silver");
    assert.equal(result.pointsAdded, 500);
  });

  it("uses purchase amount and campaign multiplier for purchase awards", async () => {
    const { repo } = makeRepo(0);
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async () =>
      ({
        ok: true,
        async json() {
          return {
            result: {
              active: true,
              campaignId: "cmp-1",
              multiplier: 2,
              variant: "A",
              bonusPoints: 125,
            },
          };
        },
      }) as Response) as typeof fetch;

    try {
      const result = await awardPoints(repo, {
        memberIdentifier: "M-1",
        points: 0,
        transactionType: "PURCHASE",
        amountSpent: 125.9,
        reason: "purchase",
      });

      assert.equal(result.newBalance, 250);
      assert.equal(result.newTier, "Silver");
      assert.equal(result.pointsAdded, 250);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("redeems points and downgrades the tier when thresholds are crossed", async () => {
    const { repo } = makeRepo(800);

    const result = await redeemPoints(repo, {
      memberIdentifier: "M-1",
      points: 100,
      reason: "reward",
    });

    assert.equal(result.newBalance, 700);
    assert.equal(result.newTier, "Silver");
    assert.equal(result.pointsDeducted, 100);
  });

  it("blocks redemption when the balance is too low", async () => {
    const { repo } = makeRepo(10);

    await assert.rejects(
      redeemPoints(repo, {
        memberIdentifier: "M-1",
        points: 100,
        reason: "reward",
      }),
      /Not enough points/
    );
  });

  it("fails when the member does not exist", async () => {
    const missingRepo: PointsRepository = {
      async findMember() {
        return null;
      },
      async fetchTierRules() {
        return rules;
      },
      async insertAward() {
        throw new Error("should not insert award");
      },
      async insertRedemption() {
        throw new Error("should not insert redemption");
      },
      async runExpiryJob() {
        return { membersProcessed: 0, pointsExpired: 0 };
      },
    };

    await assert.rejects(
      awardPoints(missingRepo, {
        memberIdentifier: "missing",
        points: 5,
        transactionType: "MANUAL_AWARD",
        reason: "test",
      }),
      /Member not found/
    );
  });

  it("returns the expiry job result from the repository", async () => {
    const harness = makeRepo(0);
    harness.setExpiry({ membersProcessed: 2, pointsExpired: 40 });

    const expiryResult = await runExpiry(harness.repo);
    assert.deepEqual(expiryResult, { membersProcessed: 2, pointsExpired: 40 });
  });
});
