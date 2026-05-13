import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { resetIdempotencyStore } from "../idempotency.js";
import { getMemoryMember, listMemoryLedger, resetMemoryStore, seedMemoryLedgerEntry, seedMemoryMember, setMemoryTierRules, } from "../memory-repo.js";
import { createServer } from "../server.js";
const tierRules = [
    { tier_label: "Gold", min_points: 750, is_active: true },
    { tier_label: "Silver", min_points: 250, is_active: true },
    { tier_label: "Bronze", min_points: 0, is_active: true },
];
async function jsonRequest(server, method, url, body, headers) {
    const response = await server.inject({
        method,
        url,
        payload: body,
        headers: body === undefined
            ? { ...(headers || {}) }
            : {
                "content-type": "application/json",
                ...(headers || {}),
            },
    });
    return {
        statusCode: response.statusCode,
        json: response.json(),
    };
}
describe("points-engine integration coverage", () => {
    beforeEach(() => {
        resetMemoryStore();
        resetIdempotencyStore();
        setMemoryTierRules(tierRules);
        process.env.USE_LOCAL_LOYALTY_API = "true";
        process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH = "false";
    });
    it("covers award, redeem, and tier upgrade flows", async (t) => {
        const server = createServer();
        t.after(async () => {
            await server.close();
        });
        const firstAward = await jsonRequest(server, "POST", "/points/award", {
            memberIdentifier: "MEM-100",
            fallbackEmail: "mem100@example.com",
            points: 300,
            transactionType: "MANUAL_AWARD",
            reason: "welcome bonus",
        });
        assert.equal(firstAward.statusCode, 200);
        assert.equal(firstAward.json.result.newBalance, 300);
        assert.equal(firstAward.json.result.newTier, "Silver");
        const secondAward = await jsonRequest(server, "POST", "/points/award", {
            memberIdentifier: "MEM-100",
            fallbackEmail: "mem100@example.com",
            points: 500,
            transactionType: "MANUAL_AWARD",
            reason: "vip adjustment",
        });
        assert.equal(secondAward.statusCode, 200);
        assert.equal(secondAward.json.result.newBalance, 800);
        assert.equal(secondAward.json.result.newTier, "Gold");
        const redeem = await jsonRequest(server, "POST", "/points/redeem", {
            memberIdentifier: "MEM-100",
            fallbackEmail: "mem100@example.com",
            points: 100,
            reason: "gift",
        });
        assert.equal(redeem.statusCode, 200);
        assert.equal(redeem.json.result.newBalance, 700);
        assert.equal(redeem.json.result.newTier, "Silver");
        const tiers = await jsonRequest(server, "GET", "/points/tiers");
        assert.equal(tiers.statusCode, 200);
        assert.equal(tiers.json.tiers[0].tier_label, "Gold");
    });
    it("enforces idempotency and guards against insufficient points", async (t) => {
        const server = createServer();
        t.after(async () => {
            await server.close();
        });
        const payload = {
            memberIdentifier: "MEM-IDEMP",
            fallbackEmail: "idem@example.com",
            points: 200,
            transactionType: "MANUAL_AWARD",
            reason: "idempotent award",
        };
        const first = await jsonRequest(server, "POST", "/points/award", payload, {
            "idempotency-key": "award-1",
        });
        const replay = await jsonRequest(server, "POST", "/points/award", payload, {
            "idempotency-key": "award-1",
        });
        assert.equal(first.statusCode, 200);
        assert.equal(replay.statusCode, 200);
        assert.deepEqual(replay.json, first.json);
        const memberAfterReplay = getMemoryMember("MEM-IDEMP", "idem@example.com");
        assert.equal(memberAfterReplay?.points_balance, 200);
        const conflict = await jsonRequest(server, "POST", "/points/award", { ...payload, points: 220 }, { "idempotency-key": "award-1" });
        assert.equal(conflict.statusCode, 409);
        assert.equal(conflict.json.code, "IDEMPOTENCY_CONFLICT");
        const insufficient = await jsonRequest(server, "POST", "/points/redeem", {
            memberIdentifier: "MEM-IDEMP",
            fallbackEmail: "idem@example.com",
            points: 500,
            reason: "too much",
        });
        assert.equal(insufficient.statusCode, 422);
        assert.equal(insufficient.json.code, "INSUFFICIENT_POINTS");
    });
    it("expires seeded points through the service endpoint", async (t) => {
        const server = createServer();
        t.after(async () => {
            await server.close();
        });
        seedMemoryMember({
            memberIdentifier: "MEM-EXP",
            fallbackEmail: "exp@example.com",
            pointsBalance: 0,
        });
        seedMemoryLedgerEntry({
            memberIdentifier: "MEM-EXP",
            fallbackEmail: "exp@example.com",
            changeType: "PURCHASE",
            pointsDelta: 200,
            expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            reason: "expired purchase",
        });
        seedMemoryLedgerEntry({
            memberIdentifier: "MEM-EXP",
            fallbackEmail: "exp@example.com",
            changeType: "PURCHASE",
            pointsDelta: 50,
            expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            reason: "still valid purchase",
        });
        const result = await jsonRequest(server, "POST", "/points/expiry/run");
        assert.equal(result.statusCode, 200);
        assert.deepEqual(result.json.result, {
            membersProcessed: 1,
            pointsExpired: 200,
        });
        const member = getMemoryMember("MEM-EXP", "exp@example.com");
        assert.equal(member?.points_balance, 50);
        assert.equal(member?.tier, "Bronze");
        const ledger = listMemoryLedger();
        assert.ok(ledger.some((entry) => entry.change_type === "EXPIRY_DEDUCTION" && entry.points_delta === -200));
    });
    it("validates bad payloads before processing", async (t) => {
        const server = createServer();
        t.after(async () => {
            await server.close();
        });
        const invalidAward = await jsonRequest(server, "POST", "/points/award", {
            memberIdentifier: "",
            points: -1,
            transactionType: "MANUAL_AWARD",
            reason: "",
        });
        assert.equal(invalidAward.statusCode, 400);
        assert.equal(invalidAward.json.ok, false);
        assert.equal(invalidAward.json.error, "Validation failed.");
    });
});
