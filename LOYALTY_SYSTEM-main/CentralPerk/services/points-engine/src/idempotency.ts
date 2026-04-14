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
  if (data.request_hash !== hash) return null;
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
