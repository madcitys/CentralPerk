import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Verifier } from "@pact-foundation/pact";

import { createServer } from "../dist/server.js";
import { resetMemoryCampaignStore, seedMemoryCampaign } from "../dist/repo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pactPath = path.resolve(__dirname, "../../../centralperk-frontend/pacts/loyalty-frontend-campaign-service.json");

if (!fs.existsSync(pactPath)) {
  throw new Error(`Missing pact file at ${pactPath}. Run centralperk-frontend contract tests first.`);
}

process.env.USE_LOCAL_LOYALTY_API = "true";
process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH = "false";

const server = createServer();
await server.listen({ host: "127.0.0.1", port: 4102 });

try {
  const verifier = new Verifier({
    provider: "campaign-service",
    providerBaseUrl: "http://127.0.0.1:4102",
    pactUrls: [pactPath],
    logLevel: "info",
    stateHandlers: {
      "campaigns can be created in draft": async () => {
        resetMemoryCampaignStore(false);
      },
      "a draft campaign can be published": async () => {
        resetMemoryCampaignStore(false);
        seedMemoryCampaign({
          id: "cmp-pact",
          campaignCode: "CMP-PACT",
          campaignName: "Pact Campaign",
          campaignType: "multiplier_event",
          status: "draft",
          multiplier: 2,
          minimumPurchaseAmount: 0,
          startsAt: "2026-01-01T00:00:00.000Z",
          endsAt: "2026-12-31T23:59:59.000Z",
          budgetLimit: 1000,
          autoPause: true,
        });
      },
      "a campaign budget status can be queried": async () => {
        resetMemoryCampaignStore(false);
        seedMemoryCampaign({
          id: "cmp-pact",
          campaignCode: "CMP-PACT",
          campaignName: "Pact Campaign",
          campaignType: "multiplier_event",
          status: "active",
          multiplier: 2,
          minimumPurchaseAmount: 0,
          startsAt: "2026-01-01T00:00:00.000Z",
          endsAt: "2026-12-31T23:59:59.000Z",
          budgetLimit: 1000,
          autoPause: true,
        });
      },
    },
  });

  await verifier.verifyProvider();
  console.log("Campaign Service Pact verification passed.");
} finally {
  await server.close();
}
