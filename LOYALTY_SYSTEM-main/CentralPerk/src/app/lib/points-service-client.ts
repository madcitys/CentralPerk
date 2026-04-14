const BASE_URL =
  process.env.GATEWAY_URL ||
  process.env.NEXT_PUBLIC_GATEWAY_URL ||
  process.env.POINTS_ENGINE_URL ||
  process.env.NEXT_PUBLIC_POINTS_ENGINE_URL ||
  "http://localhost:4001";

function fullUrl(path: string) {
  return `${BASE_URL.replace(/\/+$/, "")}${path}`;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(fullUrl(path), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || `Points service error (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function awardPoints(payload: any, idempotencyKey?: string) {
  return call<{ ok: boolean; result: any }>("/points/award", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
  });
}

export async function redeemPoints(payload: any, idempotencyKey?: string) {
  return call<{ ok: boolean; result: any }>("/points/redeem", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
  });
}

export async function fetchTiers() {
  return call<{ ok: boolean; tiers: any[] }>("/points/tiers", { method: "GET" });
}

export async function awardPointsViaService(payload: any, idempotencyKey?: string) {
  return awardPoints(payload, idempotencyKey);
}

export async function redeemPointsViaService(payload: any, idempotencyKey?: string) {
  return redeemPoints(payload, idempotencyKey);
}

export async function fetchTierRulesViaService() {
  return fetchTiers();
}

export async function runExpiryViaService() {
  return call<{ ok: boolean; result: any }>("/points/expiry/run", { method: "POST" });
}
