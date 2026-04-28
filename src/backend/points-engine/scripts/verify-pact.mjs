import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Verifier } from "@pact-foundation/pact";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../../..");

function resolvePactUrls() {
  const configured = String(process.env.PACT_URLS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (configured.length > 0) {
    return configured.map((entry) => (/^[a-z]+:\/\//i.test(entry) ? entry : path.resolve(rootDir, entry)));
  }

  const defaultPact = path.resolve(rootDir, "src/frontend/pacts/loyalty-frontend-points-engine.json");
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
    resetPointsTestState,
    seedAwardableMember,
    seedExpiringPointsMember,
    seedRedeemableMember,
  } = await import("../dist/testing/state.js");

  const server = createServer();
  const address = await server.listen({ host: "127.0.0.1", port: 0 });
  const brokerOptions = !process.env.PACT_URLS ? resolveBrokerVerificationOptions() : null;

  try {
    await new Verifier({
      providerBaseUrl: address,
      provider: process.env.PACT_PROVIDER_NAME || "points-engine",
      ...(brokerOptions ?? { pactUrls: resolvePactUrls() }),
      logLevel: process.env.PACT_LOG_LEVEL || "warn",
      stateHandlers: {
        "a member can receive awarded points": async () => {
          seedAwardableMember();
        },
        "a member has redeemable points": async () => {
          seedRedeemableMember();
        },
        "points tiers are available": async () => {
          resetPointsTestState();
        },
        "an expiry run has expiring purchase points": async () => {
          seedExpiringPointsMember();
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
