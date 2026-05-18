import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = (process.env.CENTRALPERK_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");

async function requestOk(path, init) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { text };
    }
  }

  assert.equal(
    response.status < 500,
    true,
    `${path} returned ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`,
  );
  assert.equal(
    response.ok,
    true,
    `${path} returned ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`,
  );
  return payload;
}

async function requestHandled(path, init, allowedStatuses = []) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { text };
    }
  }
  const allowed = response.ok || allowedStatuses.includes(response.status);
  assert.equal(
    allowed,
    true,
    `${path} returned ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`,
  );
  return payload;
}

test("sample API test: login page, admin members, points, rewards, and lifecycle APIs stay reachable", async () => {
  const sampleRunId = Date.now();
  const loginPage = await fetch(`${baseUrl}/login`);
  assert.equal(loginPage.ok, true, `/login returned ${loginPage.status}`);

  await requestOk("/api/health");
  const membersPayload = await requestOk("/api/admin/members");
  const firstMember = Array.isArray(membersPayload.members) ? membersPayload.members[0] : null;
  await requestOk("/api/points/ledger?limit=5");
  await requestOk("/api/points/tiers");
  await requestOk("/api/points/earning-rules");
  await requestOk("/api/points/expiry/run", {
    method: "POST",
    body: JSON.stringify({}),
  });
  await requestOk("/api/rewards");
  await requestOk("/api/reward-partners/performance");
  await requestOk("/api/partners/dashboard");
  await requestHandled("/api/partners/settlements", {
    method: "POST",
    body: JSON.stringify({ partnerId: "sample-partner", commissionRate: 0.12 }),
  }, [404, 503]);
  await requestOk("/api/members/profile", {
    method: "POST",
    body: JSON.stringify({
      firstName: "Api",
      lastName: "Sample",
      email: `api.sample.${sampleRunId}@example.com`,
      phone: `09${String(sampleRunId).slice(-9)}`,
      birthdate: "1998-01-01",
    }),
  });
  await requestOk("/api/members/birthday-settings");
  await requestOk("/api/members/referrals");
  await requestOk("/api/members/feedback");
  await requestHandled("/api/members/feedback", {
    method: "POST",
    body: JSON.stringify({
      memberId: firstMember?.memberNumber || "sample-member",
      memberName: firstMember ? `${firstMember.firstName || "Sample"} ${firstMember.lastName || "Member"}`.trim() : "Sample Member",
      category: "service",
      rating: 5,
      comment: "Sample API test feedback.",
      contactOptIn: false,
    }),
  }, [503]);
  await requestOk("/api/members/badges/leaderboard?limit=5");
  await requestHandled("/api/vouchers/sample-voucher", {
    method: "PATCH",
    body: JSON.stringify({ action: "validate", voucherCode: "sample-code" }),
  }, [404, 503]);
  await requestHandled("/api/engagement/surveys/sample-survey/responses", {
    method: "POST",
    body: JSON.stringify({
      memberIdentifier: firstMember?.memberNumber || "sample-member",
      answers: { q1: "sample" },
      bonusPoints: 0,
    }),
  }, [503]);

  if (firstMember?.email) {
    await requestOk(`/api/members/profile?email=${encodeURIComponent(firstMember.email)}`);
  }
  if (firstMember?.memberNumber) {
    await requestOk(`/api/members/${encodeURIComponent(firstMember.memberNumber)}/profile`, {
      method: "PATCH",
      body: JSON.stringify({ fallbackEmail: firstMember.email || undefined }),
    });
    await requestOk(`/api/members/tier-history?memberIdentifier=${encodeURIComponent(firstMember.memberNumber)}`);
    await requestOk(`/api/members/badges/progress?memberIdentifier=${encodeURIComponent(firstMember.memberNumber)}`);
  }
});
