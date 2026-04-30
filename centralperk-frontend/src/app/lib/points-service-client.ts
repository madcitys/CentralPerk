import { apiUrl } from "./api-config";

const configuredTimeout = Number(process.env.POINTS_SERVICE_TIMEOUT_MS || 900);
const DEFAULT_TIMEOUT_MS = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 900;

export class PointsServiceError extends Error {
  statusCode: number;
  code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.name = "PointsServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function fullUrl(path: string) {
  const pointsServiceBaseUrl = (process.env.POINTS_ENGINE_URL || "").replace(/\/+$/, "");
  if (pointsServiceBaseUrl) {
    return `${pointsServiceBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  }
  return apiUrl(path);
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const res = await fetch(fullUrl(path), {
    ...init,
    signal: controller.signal,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  }).finally(() => clearTimeout(timeout));
  const raw = await res.text();
  if (raw.includes("<!DOCTYPE html") || raw.includes("__next/static") || raw.includes("<html")) {
    throw new Error("Points API returned HTML instead of backend JSON.");
  }
  if (!res.ok) {
    let message = raw;
    try {
      const parsed = JSON.parse(raw || "{}") as { error?: unknown; message?: unknown };
      message = String(parsed.error || parsed.message || raw);
    } catch {
    }
    throw new Error(message || `Points service error (${res.status})`);
  }
  return (raw ? JSON.parse(raw) : {}) as T;
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
  try {
    return await call<{ ok: boolean; tiers: any[] }>("/points/tiers", { method: "GET" });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error || "");
    if (message.includes("404")) {
      return call<{ ok: boolean; tiers: any[] }>("/tiers", { method: "GET" });
    }
    throw error;
  }
}

export async function runExpiry() {
  return call<{ ok: boolean; result: any }>("/points/expiry/run", { method: "POST" });
}

export const awardPointsViaService = awardPoints;
export const redeemPointsViaService = redeemPoints;
export const fetchTierRulesViaService = fetchTiers;
export const runExpiryViaService = runExpiry;
