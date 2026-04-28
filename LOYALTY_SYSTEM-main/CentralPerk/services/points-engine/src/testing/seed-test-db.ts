import { describePointsTestState, resetPointsTestState, seedAwardableMember, seedExpiringPointsMember, seedRedeemableMember } from "./state.js";

resetPointsTestState();
seedAwardableMember(false);
seedRedeemableMember(false);
seedExpiringPointsMember(false);

console.log(
  JSON.stringify(
    {
      service: "points-engine",
      action: "seed",
      snapshot: describePointsTestState(),
    },
    null,
    2
  )
);
