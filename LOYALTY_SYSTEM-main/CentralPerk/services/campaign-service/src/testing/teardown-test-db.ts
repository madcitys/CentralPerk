import { describeCampaignTestState, resetCampaignTestState } from "./state.js";

resetCampaignTestState();

console.log(
  JSON.stringify(
    {
      service: "campaign-service",
      action: "teardown",
      snapshot: describeCampaignTestState(),
    },
    null,
    2
  )
);
