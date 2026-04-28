import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = process.cwd();
const frontendReadmePath = join(repoRoot, "README.md");
const frontendEnvExamplePath = join(repoRoot, ".env.example");
const gitignorePath = join(repoRoot, ".gitignore");
const requiredEnvVars = [
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_GATEWAY_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PROJECT_ID",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_ENABLE_DEMO_AUTH",
  "NEXT_PUBLIC_USE_LOCAL_LOYALTY_API",
  "NEXT_PUBLIC_USE_REMOTE_LOYALTY_API",
  "NEXT_PUBLIC_FORCE_CUSTOMER_DEMO_AUTH",
];
const textFileExtensions = new Set([".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".ts", ".tsx", ".txt", ".yml", ".yaml"]);

let failed = false;

function pass(message) {
  console.log(`[verify] ok: ${message}`);
}

function fail(message) {
  failed = true;
  console.error(`[verify] fail: ${message}`);
}

function readUtf8(filePath) {
  return readFileSync(filePath, "utf8");
}

function walkFiles(directory, results = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".next" || entry.name === "node_modules") continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, results);
      continue;
    }
    results.push(fullPath);
  }
  return results;
}

function isTextFile(filePath) {
  return [...textFileExtensions].some((extension) => filePath.endsWith(extension));
}

for (const requiredPath of [frontendReadmePath, frontendEnvExamplePath, gitignorePath]) {
  if (!existsSync(requiredPath)) {
    fail(`Missing required file: ${relative(repoRoot, requiredPath)}`);
  } else {
    pass(`Found ${relative(repoRoot, requiredPath)}`);
  }
}

if (existsSync(frontendEnvExamplePath)) {
  const envExample = readUtf8(frontendEnvExamplePath);
  for (const envVar of requiredEnvVars) {
    if (!new RegExp(`^${envVar}=`, "m").test(envExample)) {
      fail(`.env.example is missing ${envVar}.`);
    }
  }
}

if (existsSync(frontendReadmePath)) {
  const readme = readUtf8(frontendReadmePath);
  if (!/Copy-Item\s+\.env\.example\s+\.env\.local/i.test(readme)) {
    fail("README should explain how to create .env.local from .env.example.");
  }
  if (!/npm run dev/i.test(readme) || !/npm run build/i.test(readme)) {
    fail("README should include run and build instructions.");
  }
  if (!/Never commit [`"]?\.env\.local[`"]?, [`"]?\.env[`"]?, credentials, or service-role keys\./i.test(readme)) {
    fail("README should call out the no-secrets commit rule.");
  }
}

if (existsSync(gitignorePath)) {
  const gitignore = readUtf8(gitignorePath);
  if (!gitignore.includes(".env") || !gitignore.includes("!.env.example")) {
    fail(".gitignore must ignore env files while allowing .env.example.");
  }
}

const violations = [];
for (const filePath of walkFiles(repoRoot)) {
  if (!isTextFile(filePath)) continue;
  const relativePath = relative(repoRoot, filePath).replace(/\\/g, "/");
  if (
    relativePath === ".env.example" ||
    relativePath === "README.md" ||
    relativePath.startsWith("tests/contracts/") ||
    relativePath.startsWith("tests/performance/") ||
    relativePath.startsWith("scripts/")
  ) {
    continue;
  }

  const contents = readUtf8(filePath);
  if (contents.includes("http://localhost:4000") || contents.includes("http://127.0.0.1:4000")) {
    violations.push(relativePath);
  }
}

if (violations.length > 0) {
  fail(`Hardcoded local API URLs found:\n- ${violations.join("\n- ")}`);
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("[verify] loyalty frontend handoff checks passed.");
}

