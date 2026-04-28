import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignMemberVariant,
  declareCampaignWinner,
  getActive,
  getBudgetStatus,
  getCampaign,
  getCampaigns,
  lookupActiveMultiplier,
  pauseCampaign,
  publishCampaign,
  queueCampaignNotifications,
  loadPerformance,
  saveCampaign,
  setRepo,
} from "../engine.js";
import type { CampaignWinnerResult, MultiplierLookupResult } from "../types.js";

describe("campaign-service unit coverage", () => {
  it("looks up a multiplier and tracks budget consumption", async () => {
    let budgetConsumed = 0;

    setRepo({
      async lookupMultiplier() {
        return {
          active: true,
          campaignId: "cmp-1",
          multiplier: 2,
          variant: "A",
          bonusPoints: 50,
        } satisfies MultiplierLookupResult;
      },
      async trackBudgetConsumption(_campaignId: string, bonusPoints: number) {
        budgetConsumed += bonusPoints;
        return { budget_remaining: 1000 - budgetConsumed, paused: budgetConsumed >= 1000 };
      },
      async findMemberId() {
        return 1;
      },
      async assignVariant() {
        return { campaignId: "cmp-1", memberId: 1, variant: "A" as const };
      },
      async upsertCampaign(input: any) {
        return { ...input, id: "cmp-1", budgetSpent: 0 };
      },
      async publishCampaign() {
        return { id: "cmp-1", campaignCode: "CMP-1", campaignName: "Campaign", status: "active" };
      },
      async pauseCampaign() {
        return { id: "cmp-1", campaignCode: "CMP-1", campaignName: "Campaign", status: "paused" };
      },
      async declareWinner(_campaignId: string, scores: { A: number; B: number }) {
        return {
          campaignId: "cmp-1",
          winner: scores.B > scores.A ? "B" : "A",
          declaredAt: "2026-01-01T00:00:00.000Z",
          scores,
        } satisfies CampaignWinnerResult;
      },
      async listCampaigns() {
        return [];
      },
      async getCampaignById() {
        return null;
      },
      async getActiveCampaigns() {
        return [];
      },
      async queueCampaignNotifications() {
        return 0;
      },
      async loadCampaignPerformance() {
        return [];
      },
      async getCampaignBudgetStatus() {
        return {};
      },
    } as any);

    const result = await lookupActiveMultiplier({
      memberIdentifier: "M-1",
      amountSpent: 50,
    } as any);

    assert.equal(result.active, true);
    assert.equal(result.multiplier, 2);
    assert.equal(budgetConsumed, 50);
  });

  it("assigns a variant for a known member", async () => {
    setRepo({
      async findMemberId() {
        return 7;
      },
      async assignVariant(campaignId: string, memberId: number) {
        return { campaignId, memberId, variant: "B" as const };
      },
    } as any);

    const assignment = await assignMemberVariant("cmp-42", "member-42");
    assert.deepEqual(assignment, { campaignId: "cmp-42", memberId: 7, variant: "B" });
  });

  it("saves, publishes, pauses, and declares a winner", async () => {
    setRepo({
      async upsertCampaign(input: any) {
        return { ...input, id: "cmp-2", budgetSpent: 0 };
      },
      async publishCampaign() {
        return { id: "cmp-2", campaignCode: "CMP-2", campaignName: "Launch", status: "active" };
      },
      async pauseCampaign() {
        return { id: "cmp-2", campaignCode: "CMP-2", campaignName: "Launch", status: "paused" };
      },
      async declareWinner(_campaignId: string, scores: { A: number; B: number }) {
        return {
          campaignId: "cmp-2",
          winner: scores.B > scores.A ? "B" : "A",
          declaredAt: "2026-01-01T00:00:00.000Z",
          scores,
        };
      },
    } as any);

    const saved = await saveCampaign({
      campaignCode: "CMP-2",
      campaignName: "Launch",
      campaignType: "multiplier_event",
      startsAt: "2026-01-01T00:00:00.000Z",
      endsAt: "2026-12-31T23:59:59.000Z",
    });
    assert.equal(saved.id, "cmp-2");

    const published = await publishCampaign("cmp-2");
    assert.equal(published.status, "active");

    const paused = await pauseCampaign("cmp-2");
    assert.equal(paused.status, "paused");

    const winner = await declareCampaignWinner("cmp-2", { A: 10, B: 12 });
    assert.equal(winner.winner, "B");
  });

  it("loads campaign lists, details, performance, notifications, and budget status", async () => {
    setRepo({
      async listCampaigns() {
        return [{ id: "cmp-9", campaignCode: "CMP-9", campaignName: "Nine", status: "active" }];
      },
      async getCampaignById(campaignId: string) {
        return campaignId === "cmp-9" ? { id: "cmp-9", campaignCode: "CMP-9", campaignName: "Nine", status: "active" } : null;
      },
      async getActiveCampaigns() {
        return [{ id: "cmp-9", campaignCode: "CMP-9", campaignName: "Nine", status: "active" }];
      },
      async queueCampaignNotifications() {
        return 3;
      },
      async loadCampaignPerformance() {
        return [{ campaign_id: "cmp-9", tracked_transactions: 4 }];
      },
      async getCampaignBudgetStatus() {
        return { campaignId: "cmp-9", status: "active", budgetRemaining: 90 };
      },
    } as any);

    const campaigns = await getCampaigns();
    const campaign = await getCampaign("cmp-9");
    const active = await getActive();
    const queued = await queueCampaignNotifications("cmp-9");
    const performance = await loadPerformance();
    const budgetStatus = await getBudgetStatus("cmp-9");

    assert.equal(campaigns.length, 1);
    assert.equal(campaign?.id, "cmp-9");
    assert.equal(active[0]?.id, "cmp-9");
    assert.equal(queued, 3);
    assert.equal(performance[0]?.campaign_id, "cmp-9");
    assert.equal(budgetStatus.budgetRemaining, 90);
  });
});
