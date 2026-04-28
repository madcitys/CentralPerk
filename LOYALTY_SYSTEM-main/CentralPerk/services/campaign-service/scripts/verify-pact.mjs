import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Verifier } from "@pact-foundation/pact";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");

function resolvePactUrls() {
  const configured = String(process.env.PACT_URLS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (configured.length > 0) {
    return configured.map((entry) => (/^[a-z]+:\/\//i.test(entry) ? entry : path.resolve(rootDir, entry)));
  }

  const defaultPact = path.resolve(rootDir, "pacts/loyalty-frontend-campaign-service.json");
  if (!existsSync(defaultPact)) {
    throw new Error(`Pact file not found: ${defaultPact}. Run the consumer contract tests first.`);
  }
  return [defaultPact];
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveBrokerVerificationOptions() {
  const brokerUrl = process.env.PACT_BROKER_BASE_URL;
  if (!brokerUrl) {
    return null;
  }

  const parsed = new URL(brokerUrl);
  const brokerUsername = process.env.PACT_BROKER_USERNAME || decodeURIComponent(parsed.username || "");
  const brokerPassword = process.env.PACT_BROKER_PASSWORD || decodeURIComponent(parsed.password || "");
  parsed.username = "";
  parsed.password = "";

  const branch = process.env.PACT_BRANCH || process.env.GITHUB_REF_NAME || "local";
  const providerVersion = process.env.PACT_PROVIDER_VERSION || process.env.GITHUB_SHA || process.env.npm_package_version || "dev-local";
  const providerVersionTags = splitCsv(process.env.PACT_PROVIDER_TAGS || process.env.PACT_TARGET_ENVIRONMENT || "test");
  const options = {
    pactBrokerUrl: parsed.toString().replace(/\/$/, ""),
    consumerVersionSelectors: [{ branch, latest: true }],
    providerVersion,
    providerVersionBranch: branch,
    providerVersionTags,
    publishVerificationResult: true,
  };

  const brokerToken = process.env.PACT_BROKER_TOKEN || "";
  if (brokerToken) {
    options.pactBrokerToken = brokerToken;
  } else if (brokerUsername) {
    options.pactBrokerUsername = brokerUsername;
    options.pactBrokerPassword = brokerPassword;
  }

  return options;
}

async function main() {
  const { createServer } = await import("../dist/server.js");
  const {
    resetCampaignTestState,
    seedActiveCampaign,
    seedBudgetStatusCampaign,
    seedCampaignCollection,
    seedPublishableCampaign,
  } = await import("../dist/testing/state.js");

  const server = createServer();
  const address = await server.listen({ host: "127.0.0.1", port: 0 });
  const brokerOptions = !process.env.PACT_URLS ? resolveBrokerVerificationOptions() : null;

  try {
    await new Verifier({
      providerBaseUrl: address,
      provider: process.env.PACT_PROVIDER_NAME || "campaign-service",
      ...(brokerOptions ?? { pactUrls: resolvePactUrls() }),
      logLevel: process.env.PACT_LOG_LEVEL || "warn",
      stateHandlers: {
        "campaign collection exists": async () => {
          seedCampaignCollection();
        },
        "an active campaign is available": async () => {
          seedActiveCampaign();
        },
        "a campaign can be created": async () => {
          resetCampaignTestState();
        },
        "a draft campaign can be published": async () => {
          seedPublishableCampaign();
        },
        "a campaign budget status is available": async () => {
          seedBudgetStatusCampaign();
        },
      },
    }).verifyProvider();
  } finally {
    await server.close();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
