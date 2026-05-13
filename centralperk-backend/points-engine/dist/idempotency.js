import crypto from "crypto";
import { pointsDb } from "./supabase-client.js";
import { config } from "./config.js";
const memoryStore = new Map();
function shouldUseMemoryStore() {
    return (process.env.USE_LOCAL_LOYALTY_API === "true" ||
        process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true" ||
        !config.pointsSupabaseUrl ||
        !config.pointsSupabaseServiceKey);
}
function storageKey(route, key) {
    return `${route}::${key}`;
}
function buildConflict() {
    const conflict = new Error("This idempotency key was already used for a different request.");
    conflict.statusCode = 409;
    conflict.code = "IDEMPOTENCY_CONFLICT";
    return conflict;
}
function readMemory(route, key, hash) {
    const stored = memoryStore.get(storageKey(route, key));
    if (!stored)
        return null;
    if (stored.requestHash !== hash)
        throw buildConflict();
    return stored;
}
function writeMemory(route, key, payload, response) {
    memoryStore.set(storageKey(route, key), {
        requestHash: hashPayload(payload),
        response,
    });
}
export async function checkIdempotency(route, key, payload) {
    const hash = hashPayload(payload);
    if (shouldUseMemoryStore()) {
        const stored = readMemory(route, key, hash);
        return stored ? { response: stored.response } : null;
    }
    const { data, error } = await pointsDb
        .from("points_idempotency")
        .select("response,request_hash")
        .eq("key", key)
        .eq("route", route)
        .maybeSingle();
    if (error) {
        const stored = readMemory(route, key, hash);
        return stored ? { response: stored.response } : null;
    }
    if (!data) {
        const stored = readMemory(route, key, hash);
        return stored ? { response: stored.response } : null;
    }
    if (data.request_hash !== hash) {
        throw buildConflict();
    }
    return { response: data.response };
}
export async function storeIdempotency(route, key, payload, response) {
    writeMemory(route, key, payload, response);
    if (shouldUseMemoryStore())
        return;
    const hash = hashPayload(payload);
    const { error } = await pointsDb.from("points_idempotency").upsert({
        key,
        route,
        request_hash: hash,
        response,
    });
    if (error) {
        writeMemory(route, key, payload, response);
    }
}
export function resetIdempotencyStore() {
    memoryStore.clear();
}
function hashPayload(payload) {
    return crypto.createHash("sha256").update(JSON.stringify(payload || {})).digest("hex");
}
