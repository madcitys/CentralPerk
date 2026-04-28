const checks = [
  { name: "backend", url: process.env.BACKEND_HEALTH_URL || "http://localhost:4000/health" },
  { name: "frontend", url: process.env.FRONTEND_HEALTH_URL || "http://localhost:3000" },
];

let failed = false;

for (const check of checks) {
  try {
    const startedAt = performance.now();
    const response = await fetch(check.url, {
      headers: { accept: "application/json,text/html;q=0.9,*/*;q=0.8" },
    });
    const elapsedMs = Math.round(performance.now() - startedAt);
    if (!response.ok) {
      failed = true;
      console.error(`[health] ${check.name} failed ${response.status} in ${elapsedMs}ms ${check.url}`);
      continue;
    }
    console.log(`[health] ${check.name} ok ${response.status} in ${elapsedMs}ms ${check.url}`);
  } catch (error) {
    failed = true;
    console.error(`[health] ${check.name} unreachable ${check.url}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed) {
  process.exitCode = 1;
}
