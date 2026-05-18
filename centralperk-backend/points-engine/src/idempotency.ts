import crypto from "crypto";
import { supabase } from "./supabase-client.js";

type Stored = { response: any };

export class IdempotencyConflictError extends Error {
  statusCode = 409;

  constructor() {
    super("This idempotency key was already used for a different request.");
  }
}

function isMissingIdempotencyTable(error: unknown) {
  const code = String((error as { code?: unknown })?.code ?? "");
  const message = String((error as { message?: unknown; details?: unknown; hint?: unknown })?.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    (message.includes("points_idempotency") && (message.includes("does not exist") || message.includes("schema cache")))
  );
}

export async function checkIdempotency(route: string, key: string, payload: any): Promise<Stored | null> {
  const hash = hashPayload(payload);
  const { data, error } = await supabase
    .from("points_idempotency")
    .select("response,request_hash")
    .eq("key", key)
    .eq("route", route)
    .maybeSingle();
  if (error) {
    if (isMissingIdempotencyTable(error)) return null;
    throw error;
  }
  if (!data) return null;
  if (data.request_hash !== hash) throw new IdempotencyConflictError();
  return { response: data.response };
}

export async function storeIdempotency(route: string, key: string, payload: any, response: any) {
  const hash = hashPayload(payload);
  const { error } = await supabase
    .from("points_idempotency")
    .upsert({
      key,
      route,
      request_hash: hash,
      response,
      created_at: new Date().toISOString(),
    }, { onConflict: "route,key" });
  if (error && !isMissingIdempotencyTable(error)) throw error;
}

function hashPayload(payload: any) {
  return crypto.createHash("sha256").update(JSON.stringify(payload || {})).digest("hex");
}
