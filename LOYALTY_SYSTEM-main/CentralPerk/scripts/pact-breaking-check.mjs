import { spawn } from "child_process";
import path from "path";

function run(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, ...extraEnv },
    });

    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function main() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

  const generateCode = await run(npmCommand, [
    "run",
    "test:contracts:break:generate",
  ]);
  if (generateCode !== 0) {
    process.exit(generateCode);
  }

  const verifyCode = await run(
    npmCommand,
    ["--prefix", "services/points-engine", "run", "verify:pact"],
    {
      PACT_URLS: path.resolve("pacts/breaking/loyalty-frontend-breaking-points-engine.json"),
    }
  );

  if (verifyCode === 0) {
    throw new Error("Intentional breaking pact unexpectedly passed provider verification.");
  }

  console.log("Intentional breaking pact failed provider verification as expected.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
