import { apiUrl } from "./api-config";

function fullUrl(path: string) {
  const campaignServiceBaseUrl = (process.env.CAMPAIGN_SERVICE_URL || "").replace(/\/+$/, "");
  if (campaignServiceBaseUrl) {
    return `${campaignServiceBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  }
  return apiUrl(path);
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(fullUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const raw = await res.text();
  if (raw.includes("<!DOCTYPE html") || raw.includes("__next/static") || raw.includes("<html")) {
    throw new Error("Campaign API returned HTML instead of backend JSON.");
  }
  if (!res.ok) {
    throw new Error(raw || `Campaign service error (${res.status})`);
  }
  return (raw ? JSON.parse(raw) : {}) as T;
}

function adminWriteHeaders(init?: RequestInit) {
  return {
    "x-role": process.env.ADMIN_ROLE || "admin",
    ...(init?.headers || {}),
  };
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
    headers: adminWriteHeaders(),
  });
}

export async function publishCampaign(campaignId: string, payload?: { queueNotifications?: boolean }) {
  return call<{ ok: boolean; campaign: any; notificationsQueued: number }>(`/campaigns/${campaignId}/publish`, {
    method: "PATCH",
    body: JSON.stringify(payload || {}),
    headers: adminWriteHeaders(),
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

export async function loadCampaignBudgetStatus(campaignId: string) {
  return call<{ ok: boolean; budgetStatus: any }>(`/campaigns/${campaignId}/budget-status`, { method: "GET" });
}

export async function queueCampaignNotifications(campaignId: string) {
  return call<{ ok: boolean; notificationsQueued: number }>(`/campaigns/${campaignId}/notify`, {
    method: "POST",
    headers: adminWriteHeaders(),
  });
}
