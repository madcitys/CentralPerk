import { describePointsTestState, resetPointsTestState } from "./state.js";

resetPointsTestState();

console.log(
  JSON.stringify(
    {
      service: "points-engine",
      action: "teardown",
      snapshot: describePointsTestState(),
    },
    null,
    2
  )
);
