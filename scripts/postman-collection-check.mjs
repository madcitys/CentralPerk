const baseUrl = (process.env.API_BASE_URL || "http://localhost:4000").replace(/\/+$/, "");
const memberId = process.env.POSTMAN_MEMBER_ID || "MEM-000008";
const memberEmail = process.env.POSTMAN_MEMBER_EMAIL || "test3@gmail.com";
const partnerId = process.env.POSTMAN_PARTNER_ID || "PARTNER-001";
const settlementMonth = process.env.POSTMAN_SETTLEMENT_MONTH || "2026-04";
const htmlMarkers = ["<!DOCTYPE html", "__next/static", "<html"];

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
    throw new Error(`[postman] ${name} returned frontend HTML instead of backend JSON in ${elapsedMs}ms ${url}`);
  }

  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch (error) {
    throw new Error(
      `[postman] ${name} returned non-JSON payload in ${elapsedMs}ms ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : typeof payload?.message === "string"
          ? payload.message
          : `Request failed (${response.status})`;
    throw new Error(`[postman] ${name} failed ${response.status} in ${elapsedMs}ms ${url}: ${message}`);
  }

  console.log(`[postman] ${name} ok in ${elapsedMs}ms ${url}`);
  return payload;
}

async function requestPdf(name, path) {
  const url = buildUrl(path);
  const startedAt = performance.now();
  const response = await fetch(url, {
    headers: {
      accept: "application/pdf,application/json",
    },
  });
  const elapsedMs = Math.round(performance.now() - startedAt);
  const contentType = String(response.headers.get("content-type") || "");
  const buffer = Buffer.from(await response.arrayBuffer());
  const textProbe = buffer.toString("utf8");

  if (htmlMarkers.some((marker) => textProbe.includes(marker))) {
    throw new Error(`[postman] ${name} returned frontend HTML instead of PDF in ${elapsedMs}ms ${url}`);
  }
  if (!response.ok) {
    throw new Error(`[postman] ${name} failed ${response.status} in ${elapsedMs}ms ${url}`);
  }
  if (!contentType.includes("application/pdf")) {
    throw new Error(`[postman] ${name} expected application/pdf but received ${contentType || "unknown"} ${url}`);
  }
  console.log(`[postman] ${name} ok in ${elapsedMs}ms ${url}`);
}

async function main() {
  const stamp = Date.now();
  const transactionRef = `POS-TEST-${stamp}`;
  const eventRef = `POS-EVENT-${stamp}`;
  const campaignId = `CAMP-${stamp}`;
  const campaignCode = `LOCAL-CAMP-${stamp}`;
  const segmentName = `High Value ${stamp}`;
  const orderId = `ORDER-${stamp}`;

  await requestJson("health", "/health");
  await requestJson("award-points", "/points/award", {
    method: "POST",
    headers: { "Idempotency-Key": transactionRef },
    body: JSON.stringify({
      memberIdentifier: memberId,
      fallbackEmail: memberEmail,
      points: 25,
      transactionType: "PURCHASE",
      transactionRef,
      reason: "Postman award verification",
      amountSpent: 500,
      productCode: "SKU-001",
      productCategory: "Beverage",
    }),
  });
  await requestJson("redeem-points", "/points/redeem", {
    method: "POST",
    body: JSON.stringify({
      memberIdentifier: memberId,
      fallbackEmail: memberEmail,
      points: 10,
      reason: "Postman redeem verification",
      transactionType: "REDEEM",
      rewardCatalogId: "REWARD-001",
    }),
  });
  await requestJson("transaction-completed", "/events/transaction-completed", {
    method: "POST",
    body: JSON.stringify({
      eventId: `EVT-${stamp}`,
      eventType: "transaction.completed",
      transactionReference: eventRef,
      memberIdentifier: memberId,
      fallbackEmail: memberEmail,
      amountSpent: 500,
      reason: "POS transaction completed test",
      productCode: "SKU-001",
      productCategory: "Beverage",
    }),
  });
  await requestJson("member-points", `/members/${encodeURIComponent(memberId)}/points?email=${encodeURIComponent(memberEmail)}`);
  await requestJson(
    "member-points-history",
    `/members/${encodeURIComponent(memberId)}/points-history?email=${encodeURIComponent(memberEmail)}`,
  );
  await requestJson("member-tier", `/members/${encodeURIComponent(memberId)}/tier?email=${encodeURIComponent(memberEmail)}`);
  await requestJson("member-profile", `/members/${encodeURIComponent(memberId)}?email=${encodeURIComponent(memberEmail)}`);
  await requestJson(
    "member-notifications",
    `/members/${encodeURIComponent(memberId)}/notifications?email=${encodeURIComponent(memberEmail)}&limit=20`,
  );
  await requestJson("member-preferences", `/members/${encodeURIComponent(memberId)}/preferences?email=${encodeURIComponent(memberEmail)}`, {
    method: "PATCH",
    body: JSON.stringify({
      sms: true,
      email: true,
      push: true,
      promotionalOptIn: true,
      frequency: "weekly",
    }),
  });

  await requestJson("create-campaign", "/campaigns", {
    method: "POST",
    body: JSON.stringify({
      id: campaignId,
      campaignCode,
      campaignName: "Bonus Points Campaign",
      description: "Campaign created for local API testing.",
      campaignType: "bonus_points",
      status: "draft",
      multiplier: 1,
      minimumPurchaseAmount: 300,
      bonusPoints: 100,
      productScope: ["Beverage"],
      eligibleTiers: ["Bronze", "Silver", "Gold"],
      startsAt: "2026-04-20T00:00:00.000Z",
      endsAt: "2026-12-31T23:59:59.000Z",
      budgetLimit: 10000,
      pushNotificationEnabled: true,
    }),
  });
  await requestJson("publish-campaign", `/campaigns/${encodeURIComponent(campaignId)}/publish`, {
    method: "PATCH",
    body: JSON.stringify({ queueNotifications: false }),
  });
  await requestJson("get-campaign", `/campaigns/${encodeURIComponent(campaignId)}`);
  await requestJson("campaign-budget-status", `/campaigns/${encodeURIComponent(campaignId)}/budget-status`);

  await requestJson("create-segment", "/segments", {
    method: "POST",
    body: JSON.stringify({
      name: segmentName,
      description: "Gold tier member segment.",
      logicMode: "AND",
      conditions: [
        {
          id: "cond-tier",
          field: "Tier",
          operator: "is",
          value: "Gold",
        },
      ],
    }),
  });
  await requestJson("preview-segment", "/segments/preview", {
    method: "POST",
    body: JSON.stringify({
      logicMode: "AND",
      conditions: [
        {
          id: "cond-points",
          field: "Points Balance",
          operator: "is above",
          value: "100",
        },
      ],
    }),
  });

  await requestJson("communications-email", "/communications/email", {
    method: "POST",
    body: JSON.stringify({
      memberId,
      email: memberEmail,
      subject: "Scheduled Email Test",
      message: "This is a scheduled email communication test.",
    }),
  });
  await requestJson("notifications-sms", "/notifications/sms", {
    method: "POST",
    body: JSON.stringify({
      memberId,
      email: memberEmail,
      subject: "Points Update",
      message: "Your points update is ready.",
      trigger: "points_awarded",
    }),
  });
  await requestJson("communications-analytics", "/communications/analytics");

  await requestJson("partners-dashboard", "/partners/dashboard");
  await requestJson("partner-dashboard", `/partners/${encodeURIComponent(partnerId)}/dashboard`);
  await requestJson("partner-transaction", "/partners/transactions", {
    method: "POST",
    body: JSON.stringify({
      partnerId,
      partnerCode: "P001",
      partnerName: "Local Rewards Partner",
      memberId,
      memberEmail,
      orderId,
      points: 250,
      grossAmount: 1500,
      note: "Partner earn/burn transaction test",
    }),
  });
  await requestJson("partner-settlement", `/partners/${encodeURIComponent(partnerId)}/settlement`, {
    method: "POST",
    body: JSON.stringify({
      month: settlementMonth,
      commissionRate: 0.12,
    }),
  });
  await requestPdf("partner-settlement-pdf", `/partners/${encodeURIComponent(partnerId)}/settlement/${encodeURIComponent(settlementMonth)}/pdf`);
  await requestJson("partner-settlement-paid", `/partners/${encodeURIComponent(partnerId)}/settlement/${encodeURIComponent(settlementMonth)}/paid`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
