const BASE_URL =
  process.env.GATEWAY_URL ||
  process.env.NEXT_PUBLIC_GATEWAY_URL ||
  process.env.CAMPAIGN_SERVICE_URL ||
  process.env.NEXT_PUBLIC_CAMPAIGN_SERVICE_URL ||
  "http://localhost:4002";

function fullUrl(path: string) {
  return `${BASE_URL.replace(/\/+$/, "")}${path}`;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(fullUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || `Campaign service error (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function listCampaigns() {
  return call<{ ok: boolean; campaigns: any[] }>("/campaigns", { method: "GET" });
}

export async function listActiveCampaigns() {
  return call<{ ok: boolean; campaigns: any[] }>("/campaigns/active", { method: "GET" });
}

export async function saveCampaign(payload: any) {
  return call<{ ok: boolean; campaign: any }>("/campaigns", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function lookupActiveMultiplier(payload: {
  memberIdentifier: string;
  fallbackEmail?: string;
  tier?: string;
  amountSpent: number;
  productCode?: string;
  productCategory?: string;
}) {
  return call<{ ok: boolean; result: any }>("/campaigns/multiplier", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function assignVariant(campaignId: string, payload: { memberIdentifier: string; fallbackEmail?: string }) {
  return call<{ ok: boolean; assignment: any }>(`/campaigns/${campaignId}/assign`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function loadCampaignPerformance() {
  return call<{ ok: boolean; performance: any[] }>("/campaigns/performance", { method: "GET" });
}

export async function queueCampaignNotifications(campaignId: string) {
  return call<{ ok: boolean; notificationsQueued: number }>(`/campaigns/${campaignId}/notify`, { method: "POST" });
}
