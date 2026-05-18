import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Verifier } from "@pact-foundation/pact";

import { createMockProviderServer } from "./support/mock-provider-server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pactPath = path.resolve(__dirname, "../contract/pacts/centralperk-web-campaign-service-api.json");

if (!fs.existsSync(pactPath)) {
  throw new Error(`Missing pact file at ${pactPath}. Run npm run test:contract first.`);
}

const server = createMockProviderServer({
  default: {
    "POST /api/campaigns/resolve-purchase": () => ({
      status: 200,
      body: {
        campaignCount: 2,
        totalAwardedPoints: 36,
        campaigns: [
          {
            campaignId: "cmp-weekend-2x",
            campaignName: "Double Points Weekend",
            campaignType: "multiplier_event",
            awardedPoints: 18,
            appliedMultiplier: 2,
            minimumPurchaseAmount: 50,
            startsAt: "2026-04-08T00:00:00.000Z",
            endsAt: "2026-04-10T23:59:59.000Z",
          }
        ]
      },
    }),
    "POST /api/campaigns/flash-sale/claim": () => ({
      status: 200,
      body: {
        campaignId: "cmp-grab-flash",
        claimedCount: 41,
        quantityLimit: 100,
        endsAt: "2026-04-08T23:59:59.000Z",
        status: "active",
      },
    }),
  },
});

await server.start();

try {
  const verifier = new Verifier({
    provider: "campaign-service-api",
    providerBaseUrl: server.url,
    pactUrls: [pactPath],
    logLevel: "info",
    stateHandlers: {
      "active bonus and multiplier campaigns exist for beverage purchases": async () => {
        server.setState("campaigns-active");
      },
      "an active flash sale still has quantity remaining": async () => {
        server.setState("flash-sale-active");
      },
    },
  });

  await verifier.verifyProvider();
  console.log("Campaign provider verification passed.");
} finally {
  await server.stop();
}
