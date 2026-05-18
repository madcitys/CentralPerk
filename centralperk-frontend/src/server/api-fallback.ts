import type { NextApiRequest } from "next";

import { serviceBaseUrl } from "./service-proxy";

export function tableMissing(error: unknown, table: string) {
  const message = String((error as { message?: unknown; details?: unknown; hint?: unknown })?.message ?? "").toLowerCase();
  return message.includes(table.toLowerCase()) && (message.includes("does not exist") || message.includes("schema cache"));
}

export function appendRequestQuery(path: string, query: NextApiRequest["query"]) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === "id") continue;
    if (Array.isArray(value)) {
      for (const entry of value) params.append(key, entry);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  const queryText = params.toString();
  return queryText ? `${path}${path.includes("?") ? "&" : "?"}${queryText}` : path;
}

export async function fetchServiceJson(req: NextApiRequest, envName: string, fallbackBaseUrl: string, path: string) {
  const method = String(req.method || "GET").toUpperCase();
  const hasBody = !["GET", "HEAD"].includes(method);
  const targetUrl = `${serviceBaseUrl(envName, fallbackBaseUrl)}${appendRequestQuery(path, req.query)}`;
  const response = await fetch(targetUrl, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : typeof payload?.error?.message === "string"
          ? payload.error.message
          : `Service failed (${response.status}).`;
    throw new Error(message);
  }

  return payload;
}
