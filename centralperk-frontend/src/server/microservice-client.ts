import { HttpError } from "./http-error";

const GATEWAY_URL =
  process.env.GATEWAY_URL ||
  process.env.NEXT_PUBLIC_GATEWAY_URL ||
  "http://127.0.0.1:4000";

function gatewayUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${GATEWAY_URL.replace(/\/+$/, "")}${normalizedPath}`;
}

export function useRemoteMicroservices() {
  return (
    process.env.USE_REMOTE_LOYALTY_API === "true" ||
    process.env.NEXT_PUBLIC_USE_REMOTE_LOYALTY_API === "true"
  );
}

export async function gatewayJson<TResponse>(
  path: string,
  init?: RequestInit,
): Promise<TResponse> {
  let response: Response;
  try {
    response = await fetch(gatewayUrl(path), {
      cache: "no-store",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    throw new HttpError(
      503,
      `API gateway is unavailable: ${error instanceof Error ? error.message : "request failed"}.`,
    );
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error?: unknown }).error)
        : `Gateway request failed (${response.status}).`;
    throw new HttpError(response.status === 502 ? 503 : response.status, message);
  }

  return payload as TResponse;
}

export async function requireGatewayUpstream(upstreamName: string, label: string) {
  if (!useRemoteMicroservices()) return;

  let response: Response;
  try {
    response = await fetch(gatewayUrl("/health"), { cache: "no-store" });
  } catch (error) {
    throw new HttpError(
      503,
      `API gateway is unavailable: ${error instanceof Error ? error.message : "request failed"}.`,
    );
  }

  const health = await response.json().catch(() => null) as {
    upstreams?:
      | Array<{ name: string; ok: boolean; error?: string }>
      | Record<string, string | { ok?: boolean; error?: string }>;
  } | null;

  const upstreams = health?.upstreams;
  const aliases = Array.from(
    new Set([
      upstreamName,
      upstreamName === "notification" ? "notifications" : upstreamName,
      upstreamName === "notifications" ? "notification" : upstreamName,
      upstreamName === "segment" ? "segments" : upstreamName,
      upstreamName === "segments" ? "segment" : upstreamName,
      upstreamName === "campaign" ? "campaignService" : upstreamName,
      upstreamName === "points" ? "pointsEngine" : upstreamName,
      upstreamName === "segment" ? "segmentService" : upstreamName,
      upstreamName === "notification" ? "notificationService" : upstreamName,
      upstreamName === "reward" ? "rewardService" : upstreamName,
      upstreamName === "member" ? "memberService" : upstreamName,
    ]),
  );

  if (Array.isArray(upstreams)) {
    const upstream = upstreams.find((entry) => aliases.includes(entry.name));
    if (upstream?.ok) return;
    throw new HttpError(
      503,
      `${label} is unavailable. Start the ${upstreamName} Docker service and try again.`,
    );
  }

  if (upstreams && typeof upstreams === "object") {
    for (const alias of aliases) {
      const upstream = upstreams[alias];
      if (typeof upstream === "string" && upstream.trim()) return;
      if (upstream && typeof upstream === "object" && upstream.ok !== false) return;
    }
  }

  throw new HttpError(
    503,
    `${label} is unavailable. Start the ${upstreamName} Docker service and try again.`,
  );
}
