const baseUrl = (process.env.API_BASE_URL || "http://localhost:4000").replace(/\/+$/, "");
const memberId = process.env.SMOKE_MEMBER_ID || "MEM-000008";
const memberEmail = process.env.SMOKE_MEMBER_EMAIL || "test3@gmail.com";
const htmlMarkers = ["<!DOCTYPE html", "<html", "__NEXT_DATA__", "/_next/static", "__next/static"];

function buildUrl(path) {
  return `${baseUrl}${path}`;
}

async function requestJson(name, path, init = {}) {
  const url = buildUrl(path);
  const startedAt = performance.now();
  const headers = new Headers(init.headers || {});
  if (!headers.has("accept")) headers.set("accept", "application/json");
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");

  const response = await fetch(url, { ...init, headers });
  const elapsedMs = Math.round(performance.now() - startedAt);
  const raw = await response.text();

  if (htmlMarkers.some((marker) => raw.includes(marker))) {
    throw new Error(`[api] ${name} returned frontend HTML instead of backend JSON in ${elapsedMs}ms ${url}`);
  }

  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch (error) {
    throw new Error(
      `[api] ${name} returned non-JSON payload in ${elapsedMs}ms ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : typeof payload?.message === "string"
          ? payload.message
          : `Request failed (${response.status})`;
    throw new Error(`[api] ${name} failed ${response.status} in ${elapsedMs}ms ${url}: ${message}`);
  }

  console.log(`[api] ${name} ok in ${elapsedMs}ms ${url}`);
  return payload;
}

let failed = false;

try {
  await requestJson("health", "/health");

  // Reset local runtime state when available so demo member is stable for QA.
  try {
    await requestJson("local-runtime-seed", "/local-runtime/seed", { method: "POST", body: JSON.stringify({}) });
  } catch {
  }

  const baselinePoints = await requestJson(
    "member-points-baseline",
    `/members/${encodeURIComponent(memberId)}/points?email=${encodeURIComponent(memberEmail)}`,
  );
  const startingBalance = Number(baselinePoints?.points ?? baselinePoints?.balance?.points_balance ?? NaN);
  if (!Number.isFinite(startingBalance)) {
    throw new Error("[api] member-points-baseline did not return a numeric balance");
  }
  console.log(`[api] member baseline balance ${startingBalance}`);

  await requestJson(
    "member-points-history",
    `/members/${encodeURIComponent(memberId)}/points-history?email=${encodeURIComponent(memberEmail)}`,
  );

  // Mutations run against a unique smoke member to avoid polluting the stable demo account.
  const transactionStamp = Date.now();
  const smokeMemberId = `SMOKE-${transactionStamp}`;
  const smokeEmail = `smoke-${transactionStamp}@example.com`;

  const beforeMutations = await requestJson(
    "smoke-member-balance-before",
    `/members/${encodeURIComponent(smokeMemberId)}/points?email=${encodeURIComponent(smokeEmail)}`,
  );
  const beforeBalance = Number(beforeMutations?.points ?? beforeMutations?.balance?.points_balance ?? NaN);
  if (!Number.isFinite(beforeBalance)) {
    throw new Error("[api] smoke-member-balance-before did not return a numeric balance");
  }

  const awardRef = `POS-SMOKE-${transactionStamp}`;
  await requestJson("points-award", "/points/award", {
    method: "POST",
    headers: {
      "Idempotency-Key": awardRef,
    },
    body: JSON.stringify({
      memberIdentifier: smokeMemberId,
      fallbackEmail: smokeEmail,
      points: 10,
      transactionType: "MANUAL_AWARD",
      transactionRef: awardRef,
      reason: "Smoke award test",
    }),
  });

  await requestJson("points-redeem", "/points/redeem", {
    method: "POST",
    body: JSON.stringify({
      memberIdentifier: smokeMemberId,
      fallbackEmail: smokeEmail,
      points: 5,
      transactionType: "REDEEM",
      rewardCatalogId: "REWARD-001",
      reason: "Smoke redeem test",
    }),
  });

  const afterMutations = await requestJson(
    "smoke-member-balance-after",
    `/members/${encodeURIComponent(smokeMemberId)}/points?email=${encodeURIComponent(smokeEmail)}`,
  );
  const afterBalance = Number(afterMutations?.points ?? afterMutations?.balance?.points_balance ?? NaN);
  if (!Number.isFinite(afterBalance)) {
    throw new Error("[api] smoke-member-balance-after did not return a numeric balance");
  }
  if (afterBalance !== beforeBalance + 5) {
    throw new Error(`[api] expected smoke ending balance ${beforeBalance + 5} but received ${afterBalance}`);
  }
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : String(error));
}

if (failed) {
  process.exitCode = 1;
}
