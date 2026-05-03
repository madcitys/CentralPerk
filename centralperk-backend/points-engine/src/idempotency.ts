import crypto from "crypto";
import { supabase } from "./supabase-client.js";

type Stored = {
  response: any;
  requestHash: string;
};

const memoryStore = new Map<string, Stored>();

function shouldUseMemoryStore() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  return (
    process.env.USE_LOCAL_LOYALTY_API === "true" ||
    process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true" ||
    !supabaseUrl ||
    (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_ANON_KEY)
  );
}

function storageKey(route: string, key: string) {
  return `${route}::${key}`;
}

function buildConflict() {
  const conflict = new Error("This idempotency key was already used for a different request.");
  (conflict as Error & { statusCode?: number; code?: string }).statusCode = 409;
  (conflict as Error & { statusCode?: number; code?: string }).code = "IDEMPOTENCY_CONFLICT";
  return conflict;
}

function readMemory(route: string, key: string, hash: string): Stored | null {
  const stored = memoryStore.get(storageKey(route, key));
  if (!stored) return null;
  if (stored.requestHash !== hash) throw buildConflict();
  return stored;
}

function writeMemory(route: string, key: string, payload: any, response: any) {
  memoryStore.set(storageKey(route, key), {
    requestHash: hashPayload(payload),
    response,
  });
}

export async function checkIdempotency(route: string, key: string, payload: any): Promise<{ response: any } | null> {
  const hash = hashPayload(payload);
  if (shouldUseMemoryStore()) {
    const stored = readMemory(route, key, hash);
    return stored ? { response: stored.response } : null;
  }

  const { data, error } = await supabase
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

export async function storeIdempotency(route: string, key: string, payload: any, response: any) {
  writeMemory(route, key, payload, response);
  if (shouldUseMemoryStore()) return;

  const hash = hashPayload(payload);
  const { error } = await supabase.from("points_idempotency").upsert({
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

function hashPayload(payload: any) {
  return crypto.createHash("sha256").update(JSON.stringify(payload || {})).digest("hex");
}
