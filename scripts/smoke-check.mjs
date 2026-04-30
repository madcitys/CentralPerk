const baseUrl = (process.env.SMOKE_BASE_URL || "http://localhost:4000").replace(/\/+$/, "");

const endpoints = [
  "/health",
  "/members",
  "/campaigns",
  "/segments",
  "/notifications?limit=20",
  "/tiers/rules",
  "/rewards",
];

const retries = Number(process.env.SMOKE_RETRIES || 12);
const retryDelayMs = Number(process.env.SMOKE_RETRY_DELAY_MS || 2_000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkEndpoint(path) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const text = await response.text();
  let body = {};

  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  if (!response.ok || body.ok === false) {
    throw new Error(`${url} returned ${response.status}: ${text}`);
  }

  console.log(`${response.status} ${url}`);
}

const failures = [];

for (const endpoint of endpoints) {
  let lastError = "";
  try {
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        await checkEndpoint(endpoint);
        lastError = "";
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (attempt < retries) {
          await sleep(retryDelayMs);
        }
      }
    }
    if (lastError) {
      throw new Error(lastError);
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
}

if (failures.length > 0) {
  console.error("Smoke checks failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Smoke checks passed.");
