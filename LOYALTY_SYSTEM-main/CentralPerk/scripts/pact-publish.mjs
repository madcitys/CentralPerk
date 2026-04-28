import { spawn } from "child_process";
import path from "path";

function parseBrokerConfig() {
  const brokerUrl = process.env.PACT_BROKER_BASE_URL;
  if (!brokerUrl) {
    throw new Error("PACT_BROKER_BASE_URL is required to publish pact files.");
  }

  const parsed = new URL(brokerUrl);
  const username = process.env.PACT_BROKER_USERNAME || decodeURIComponent(parsed.username || "");
  const password = process.env.PACT_BROKER_PASSWORD || decodeURIComponent(parsed.password || "");
  parsed.username = "";
  parsed.password = "";

  return {
    brokerUrl: parsed.toString().replace(/\/$/, ""),
    username,
    password,
    token: process.env.PACT_BROKER_TOKEN || "",
  };
}

function resolvePactBrokerCommand() {
  return path.resolve(process.cwd(), "node_modules/@pact-foundation/pact-cli/bin/pact-broker.js");
}

const { brokerUrl, username, password, token } = parseBrokerConfig();
const consumerVersion = process.env.PACT_CONSUMER_VERSION || "dev-local";
const branch = process.env.PACT_BRANCH || process.env.GITHUB_REF_NAME || "local";
const args = [
  "publish",
  path.resolve("pacts"),
  "--broker-base-url",
  brokerUrl,
  "--consumer-app-version",
  consumerVersion,
  "--branch",
  branch,
];

if (token) {
  args.push("--broker-token", token);
} else if (username) {
  args.push("--broker-username", username, "--broker-password", password);
}

const child = spawn(process.execPath, [resolvePactBrokerCommand(), ...args], {
  stdio: "inherit",
  shell: false,
  env: process.env,
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
