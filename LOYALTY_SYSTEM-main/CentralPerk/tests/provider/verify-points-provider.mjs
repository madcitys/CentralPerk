import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Verifier } from "@pact-foundation/pact";

import { createMockProviderServer } from "./support/mock-provider-server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pactPath = path.resolve(__dirname, "../contract/pacts/centralperk-web-points-engine-api.json");

if (!fs.existsSync(pactPath)) {
  throw new Error(`Missing pact file at ${pactPath}. Run npm run test:contract first.`);
}

const server = createMockProviderServer({
  default: {
    "POST /api/points/award": () => ({
      status: 200,
      body: {
        newBalance: 420,
        newTier: "Silver",
        pointsAdded: 30,
        bonusPointsAdded: 10,
        appliedCampaigns: [
          {
            campaign_id: "campaign-weekend-2x",
            campaign_name: "Double Points Weekend",
            campaign_type: "multiplier_event",
            awarded_points: 10,
            applied_multiplier: 2,
            minimum_purchase_amount: 50,
          },
        ],
      },
    }),
    "POST /api/points/redeem": () => ({
      status: 200,
      body: {
        newBalance: 300,
        newTier: "Silver",
        pointsDeducted: 120,
        ledgerEntryId: 9901,
        idempotencyKey: "redeem-MEM-000001-2026-04-08T10:30",
        processedAt: "2026-04-08T10:30:00.000Z",
      },
    }),
  },
});

await server.start();

try {
  const verifier = new Verifier({
    provider: "points-engine-api",
    providerBaseUrl: server.url,
    pactUrls: [pactPath],
    logLevel: "info",
    stateHandlers: {
      "member MEM-000001 exists and is eligible for a purchase award": async () => {
        server.setState("award-ready");
      },
      "member MEM-000001 has enough points for redemption": async () => {
        server.setState("redeem-ready");
      },
    },
  });

  await verifier.verifyProvider();
  console.log("Points provider verification passed.");
} finally {
  await server.stop();
}
