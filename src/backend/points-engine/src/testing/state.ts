import { resetIdempotencyStore } from "../idempotency.js";
import {
  listMemoryLedger,
  listMemoryMembers,
  resetMemoryStore,
  seedMemoryLedgerEntry,
  seedMemoryMember,
  setMemoryTierRules,
} from "../memory-repo.js";

export const pointsTestTierRules = [
  { tier_label: "Gold" as const, min_points: 750, is_active: true },
  { tier_label: "Silver" as const, min_points: 250, is_active: true },
  { tier_label: "Bronze" as const, min_points: 0, is_active: true },
];

export function resetPointsTestState() {
  resetMemoryStore();
  resetIdempotencyStore();
  setMemoryTierRules(pointsTestTierRules);
}

export function seedAwardableMember(reset = true) {
  if (reset) resetPointsTestState();
  return seedMemoryMember({
    memberIdentifier: "PACT-AWARD",
    fallbackEmail: "award@example.com",
    pointsBalance: 0,
  });
}

export function seedRedeemableMember(reset = true) {
  if (reset) resetPointsTestState();
  return seedMemoryMember({
    memberIdentifier: "PACT-REDEEM",
    fallbackEmail: "redeem@example.com",
    pointsBalance: 600,
    tier: "Silver",
  });
}

export function seedExpiringPointsMember(reset = true) {
  if (reset) resetPointsTestState();
  seedMemoryMember({
    memberIdentifier: "PACT-EXPIRY",
    fallbackEmail: "expiry@example.com",
    pointsBalance: 0,
  });
  seedMemoryLedgerEntry({
    memberIdentifier: "PACT-EXPIRY",
    fallbackEmail: "expiry@example.com",
    changeType: "PURCHASE",
    pointsDelta: 200,
    expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    reason: "expired pact fixture",
  });
  seedMemoryLedgerEntry({
    memberIdentifier: "PACT-EXPIRY",
    fallbackEmail: "expiry@example.com",
    changeType: "PURCHASE",
    pointsDelta: 50,
    expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    reason: "future pact fixture",
  });
}

export function describePointsTestState() {
  return {
    members: listMemoryMembers(),
    ledgerEntries: listMemoryLedger(),
  };
}
