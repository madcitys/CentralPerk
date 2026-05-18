function resolveBaseUrl() {
  if (typeof window !== "undefined") return "/api";

  const baseUrl =
    process.env.GATEWAY_URL ||
    process.env.NEXT_PUBLIC_GATEWAY_URL ||
    process.env.POINTS_ENGINE_URL ||
    process.env.NEXT_PUBLIC_POINTS_ENGINE_URL;

  if (!baseUrl) {
    throw new Error(
      "Missing points service configuration. Set GATEWAY_URL, NEXT_PUBLIC_GATEWAY_URL, POINTS_ENGINE_URL, or NEXT_PUBLIC_POINTS_ENGINE_URL."
    );
  }

  return baseUrl;
}

function fullUrl(path: string) {
  return `${resolveBaseUrl().replace(/\/+$/, "")}${path}`;
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

export async function saveTiers(rules: any[]) {
  return call<{ ok: boolean; tiers: any[] }>("/points/tiers", {
    method: "PUT",
    body: JSON.stringify({ rules }),
  });
}

export async function fetchEarningRules() {
  return call<{ ok: boolean; earningRules: any[] }>("/points/earning-rules", { method: "GET" });
}

export async function saveEarningRulesViaService(rules: any[]) {
  return call<{ ok: boolean }>("/points/earning-rules", {
    method: "PUT",
    body: JSON.stringify({ rules }),
  });
}

export async function fetchEarnTasksViaService() {
  return call<{ ok: boolean; earnTasks: any[] }>("/points/earn-tasks", { method: "GET" });
}

export async function fetchPointsActivity(memberIdentifier: string, fallbackEmail?: string) {
  const params = new URLSearchParams({ memberIdentifier });
  if (fallbackEmail) params.set("fallbackEmail", fallbackEmail);

  return call<{
    ok: boolean;
    balance: {
      member_id: string;
      points_balance: number;
      tier: string;
    };
    history: Array<{
      id?: string | number;
      member_id?: string | number;
      transaction_id?: string | number;
      transaction_type: string;
      points: number;
      balance?: number | null;
      transaction_date?: string;
      expiry_date?: string | null;
      reason?: string | null;
      reward_catalog_id?: string | number | null;
      promotion_campaign_id?: string | null;
    }>;
  }>(`/points/activity?${params.toString()}`, { method: "GET" });
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

export async function saveTierRulesViaService(rules: any[]) {
  return saveTiers(rules);
}

export async function fetchPointsActivityViaService(memberIdentifier: string, fallbackEmail?: string) {
  return fetchPointsActivity(memberIdentifier, fallbackEmail);
}

export async function runExpiryViaService() {
  return call<{ ok: boolean; result: any }>("/points/expiry/run", { method: "POST" });
}
