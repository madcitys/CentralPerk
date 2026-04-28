import { listMemoryCampaigns, resetMemoryCampaignStore, seedMemoryCampaign } from "../repo.js";

export function resetCampaignTestState() {
  resetMemoryCampaignStore(false);
}

export function seedCampaignCollection(reset = true) {
  if (reset) resetCampaignTestState();
  seedMemoryCampaign({
    id: "cmp-list",
    campaignCode: "CMP-LIST",
    campaignName: "Collection Campaign",
    campaignType: "multiplier_event",
    status: "draft",
    multiplier: 2,
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2026-12-31T23:59:59.000Z",
    budgetLimit: 100,
  });
}

export function seedActiveCampaign(reset = true) {
  if (reset) resetCampaignTestState();
  seedMemoryCampaign({
    id: "cmp-active",
    campaignCode: "CMP-ACTIVE",
    campaignName: "Active Campaign",
    campaignType: "multiplier_event",
    status: "active",
    multiplier: 2,
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2026-12-31T23:59:59.000Z",
    budgetLimit: 200,
  });
}

export function seedPublishableCampaign(reset = true) {
  if (reset) resetCampaignTestState();
  seedMemoryCampaign({
    id: "cmp-publish",
    campaignCode: "CMP-PUBLISH",
    campaignName: "Publishable Campaign",
    campaignType: "multiplier_event",
    status: "draft",
    multiplier: 2,
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2026-12-31T23:59:59.000Z",
    budgetLimit: 100,
  });
}

export function seedBudgetStatusCampaign(reset = true) {
  if (reset) resetCampaignTestState();
  seedMemoryCampaign({
    id: "cmp-budget",
    campaignCode: "CMP-BUDGET",
    campaignName: "Budget Campaign",
    campaignType: "multiplier_event",
    status: "active",
    multiplier: 2,
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2026-12-31T23:59:59.000Z",
    budgetLimit: 120,
  });
}

export function describeCampaignTestState() {
  return {
    campaigns: listMemoryCampaigns(),
  };
}
