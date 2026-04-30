import assert from "node:assert/strict";
import { awardPoints, redeemPoints, runExpiry } from "../core/engine.js";
import type { PointsRepository } from "../core/repo.js";
import type { Member, TierRule, ExpiryResult } from "../core/types.js";

const rules: TierRule[] = [
  { tier_label: "Gold", min_points: 750 },
  { tier_label: "Silver", min_points: 250 },
  { tier_label: "Bronze", min_points: 0 },
];

function makeRepo(initialBalance = 0): PointsRepository {
  let member: Member = { id: 1, member_number: "M-1", email: "a@example.com", points_balance: initialBalance, tier: "Bronze" };
  let lastExpiry: ExpiryResult = { membersProcessed: 0, pointsExpired: 0 };

  return {
    async findMember() {
      return member;
    },
    async fetchTierRules() {
      return rules;
    },
    async insertAward(_member, input, newBalance, newTier) {
      member = { ...member, points_balance: newBalance, tier: newTier as any };
      return { member_id: member.id, change_type: input.transactionType, points_delta: input.points };
    },
    async insertRedemption(_member, input, newBalance, newTier) {
      member = { ...member, points_balance: newBalance, tier: newTier as any };
      return { member_id: member.id, change_type: input.transactionType ?? "REDEEM", points_delta: -input.points };
    },
    async runExpiryJob() {
      return lastExpiry;
    },
  };
}

async function main() {
  const awardRepo = makeRepo(0);
  const awardResult = await awardPoints(awardRepo, {
    memberIdentifier: "M-1",
    points: 500,
    transactionType: "MANUAL_AWARD",
    reason: "test",
  });
  assert.equal(awardResult.newBalance, 500);
  assert.equal(awardResult.newTier, "Silver");

  const redeemRepo = makeRepo(600);
  const redeemResult = await redeemPoints(redeemRepo, {
    memberIdentifier: "M-1",
    points: 100,
    reason: "redeem",
  });
  assert.equal(redeemResult.newBalance, 500);
  assert.equal(redeemResult.newTier, "Silver");

  const lowRepo = makeRepo(10);
  let threw = false;
  try {
    await redeemPoints(lowRepo, {
      memberIdentifier: "M-1",
      points: 100,
      reason: "redeem",
    });
  } catch {
    threw = true;
  }
  assert.equal(threw, true);

  const expiryRepo = makeRepo(0);
  (expiryRepo as any).runExpiryJob = async () => ({ membersProcessed: 2, pointsExpired: 40 });
  const expiryResult = await runExpiry(expiryRepo);
  assert.equal(expiryResult.pointsExpired, 40);

  console.log("All points-engine tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
