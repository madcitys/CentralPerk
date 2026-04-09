const [, , url, timeoutArg] = process.argv;

if (!url) {
  throw new Error("Usage: node tests/support/wait-for-url.mjs <url> [timeoutMs]");
}

const timeoutMs = Math.max(1000, Number(timeoutArg || 60000));
const startedAt = Date.now();

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

while (Date.now() - startedAt < timeoutMs) {
  try {
    const response = await fetch(url);
    if (response.ok || response.status < 500) {
      console.log(`Endpoint is ready: ${url}`);
      process.exit(0);
    }
  } catch {
    // Keep polling until the timeout is reached.
  }

  await sleep(1000);
}

throw new Error(`Timed out waiting for ${url} after ${timeoutMs}ms.`);
