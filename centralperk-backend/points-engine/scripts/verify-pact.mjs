import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Verifier } from "@pact-foundation/pact";

import { createServer } from "../dist/server.js";
import {
  getMemoryMember,
  listMemoryLedger,
  resetMemoryStore,
  seedMemoryMember,
  setMemoryTierRules,
} from "../dist/memory-repo.js";
import { resetIdempotencyStore } from "../dist/idempotency.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pactPath = path.resolve(__dirname, "../../../centralperk-frontend/pacts/loyalty-frontend-points-engine.json");

if (!fs.existsSync(pactPath)) {
  throw new Error(`Missing pact file at ${pactPath}. Run centralperk-frontend contract tests first.`);
}

process.env.USE_LOCAL_LOYALTY_API = "true";
process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH = "false";

const server = createServer();
server.get("/members/:id/points", async (request, reply) => {
  const { id } = request.params;
  const email = request.query?.email;
  const member = getMemoryMember(String(id), typeof email === "string" ? email : undefined);
  if (!member) return reply.code(404).send({ ok: false, error: "Member not found." });
  return {
    ok: true,
    memberId: String(id),
    points: Number(member.points_balance || 0),
    balance: {
      member_id: String(member.member_number || id),
      points_balance: Number(member.points_balance || 0),
      tier: String(member.tier || "Bronze"),
    },
  };
});
server.get("/members/:id/tier", async (request, reply) => {
  const { id } = request.params;
  const email = request.query?.email;
  const member = getMemoryMember(String(id), typeof email === "string" ? email : undefined);
  if (!member) return reply.code(404).send({ ok: false, error: "Member not found." });
  return {
    ok: true,
    memberId: String(id),
    tier: String(member.tier || "Bronze"),
  };
});
await server.listen({ host: "127.0.0.1", port: 4101 });

try {
  const verifier = new Verifier({
    provider: "points-engine",
    providerBaseUrl: "http://127.0.0.1:4101",
    pactUrls: [pactPath],
    logLevel: "info",
    stateHandlers: {
      "a member can receive awarded points": async () => {
        resetMemoryStore();
        resetIdempotencyStore();
      },
      "a member has redeemable points": async () => {
        resetMemoryStore();
        resetIdempotencyStore();
        seedMemoryMember({
          memberIdentifier: "PACT-REDEEM",
          fallbackEmail: "redeem@example.com",
          pointsBalance: 600,
          tier: "Silver",
        });
      },
      "points tiers are available": async () => {
        resetMemoryStore();
        setMemoryTierRules([
          { tier_label: "Gold", min_points: 750, is_active: true },
          { tier_label: "Silver", min_points: 250, is_active: true },
          { tier_label: "Bronze", min_points: 0, is_active: true },
        ]);
      },
      "member points can be queried from the loyalty frontend": async () => {
        resetMemoryStore();
        seedMemoryMember({
          memberIdentifier: "MEM-000001",
          fallbackEmail: "john@example.com",
          pointsBalance: 420,
          tier: "Silver",
        });
      },
      "member tiers can be queried from the loyalty frontend": async () => {
        resetMemoryStore();
        seedMemoryMember({
          memberIdentifier: "MEM-000001",
          fallbackEmail: "john@example.com",
          pointsBalance: 420,
          tier: "Silver",
        });
      },
    },
  });

  await verifier.verifyProvider();
  console.log("Points Engine Pact verification passed.");
} finally {
  await server.close();
}
