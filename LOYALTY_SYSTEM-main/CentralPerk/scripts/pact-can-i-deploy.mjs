import { spawn } from "child_process";
import path from "path";

function parseBrokerConfig() {
  const brokerUrl = process.env.PACT_BROKER_BASE_URL;
  if (!brokerUrl) {
    throw new Error("PACT_BROKER_BASE_URL is required to run can-i-deploy.");
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
const pacticipant = process.env.PACT_PACTICIPANT || "loyalty-frontend";
const version = process.env.PACT_CONSUMER_VERSION || "dev-local";
const args = [
  "can-i-deploy",
  "--broker-base-url",
  brokerUrl,
  "--pacticipant",
  pacticipant,
  "--version",
  version,
];

const targetEnvironment = process.env.PACT_TARGET_ENVIRONMENT || "";
const targetTag = process.env.PACT_TARGET_TAG || "";
if (targetEnvironment) {
  args.push("--to-environment", targetEnvironment);
} else {
  args.push("--to", targetTag || "test");
}

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
