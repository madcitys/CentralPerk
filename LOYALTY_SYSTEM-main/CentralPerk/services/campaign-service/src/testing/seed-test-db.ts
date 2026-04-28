import {
  describeCampaignTestState,
  resetCampaignTestState,
  seedActiveCampaign,
  seedBudgetStatusCampaign,
  seedCampaignCollection,
  seedPublishableCampaign,
} from "./state.js";

resetCampaignTestState();
seedCampaignCollection(false);
seedActiveCampaign(false);
seedPublishableCampaign(false);
seedBudgetStatusCampaign(false);

console.log(
  JSON.stringify(
    {
      service: "campaign-service",
      action: "seed",
      snapshot: describeCampaignTestState(),
    },
    null,
    2
  )
);
