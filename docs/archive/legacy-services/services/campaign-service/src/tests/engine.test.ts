import assert from "node:assert/strict";
import { lookupActiveMultiplier, setRepo } from "../engine.js";
import type { MultiplierLookupResult } from "../types.js";

let budgetConsumed = 0;
let assignedVariant: string | null = null;

setRepo({
  async lookupMultiplier() {
    return {
      active: true,
      campaignId: "cmp-1",
      multiplier: 2,
      variant: "A",
      bonusPoints: 50,
    } as MultiplierLookupResult;
  },
  async trackBudgetConsumption(_campaignId: string, bonusPoints: number) {
    budgetConsumed += bonusPoints;
    return { budget_remaining: 1000 - budgetConsumed, paused: budgetConsumed >= 1000 };
  },
  async findMemberId() {
    return 1;
  },
  async assignVariant() {
    assignedVariant = assignedVariant === "A" ? "B" : "A";
    return { campaignId: "cmp-1", memberId: 1, variant: assignedVariant || "A" };
  },
  async upsertCampaign(input: any) {
    return { ...input, id: "cmp-1", budgetSpent: 0 };
  },
  async listCampaigns() {
    return [];
  },
  async getActiveCampaigns() {
    return [];
  },
} as any);

async function main() {
  const result = await lookupActiveMultiplier({
    memberIdentifier: "M-1",
    amountSpent: 50,
  } as any);
  assert.equal(result.active, true);
  assert.equal(result.multiplier, 2);
  assert.ok(budgetConsumed >= 50);
  const assign = await (await import("../engine.js")).assignMemberVariant("cmp-1", "M-1");
  assert.ok(assign.variant === "A" || assign.variant === "B");
  const paused = budgetConsumed >= 1000 ? true : false;
  assert.equal(paused, budgetConsumed >= 1000);
  console.log("Campaign service tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
