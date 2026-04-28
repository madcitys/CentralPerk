import crypto from "crypto";
import { supabase } from "./supabase-client.js";

type Stored = { response: any };

export async function checkIdempotency(route: string, key: string, payload: any): Promise<Stored | null> {
  const hash = hashPayload(payload);
  const { data, error } = await supabase
    .from("points_idempotency")
    .select("response,request_hash")
    .eq("key", key)
    .eq("route", route)
    .maybeSingle();
  if (error) return null;
  if (!data) return null;
  if (data.request_hash !== hash) {
    const conflict = new Error("This idempotency key was already used for a different request.");
    (conflict as Error & { statusCode?: number; code?: string }).statusCode = 409;
    (conflict as Error & { statusCode?: number; code?: string }).code = "IDEMPOTENCY_CONFLICT";
    throw conflict;
  }
  return { response: data.response };
}

export async function storeIdempotency(route: string, key: string, payload: any, response: any) {
  const hash = hashPayload(payload);
  await supabase
    .from("points_idempotency")
    .upsert({
      key,
      route,
      request_hash: hash,
      response,
    })
    .eq("key", key);
}

function hashPayload(payload: any) {
  return crypto.createHash("sha256").update(JSON.stringify(payload || {})).digest("hex");
}
