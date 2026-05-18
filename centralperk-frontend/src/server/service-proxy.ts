import type { NextApiRequest, NextApiResponse } from "next";

type ProxyOptions = {
  targetPath: string;
  methods?: readonly string[];
  adminWrite?: boolean;
};

type ServiceProxyOptions = ProxyOptions & {
  baseUrlEnv: string;
  fallbackBaseUrl?: string;
};

function readEnv(name: string) {
  return process.env[name]?.trim() || "";
}

export function gatewayBaseUrl() {
  const gatewayUrl =
    readEnv("GATEWAY_URL") ||
    readEnv("NEXT_PUBLIC_GATEWAY_URL") ||
    readEnv("NEXT_PUBLIC_API_BASE_URL");

  if (!gatewayUrl) {
    throw new Error(
      "Missing gateway configuration. Set GATEWAY_URL or NEXT_PUBLIC_GATEWAY_URL in the project .env or .env.local."
    );
  }

  return gatewayUrl.replace(/\/+$/, "");
}

export function serviceBaseUrl(envName: string, fallbackBaseUrl?: string) {
  const serviceUrl = readEnv(envName) || fallbackBaseUrl?.trim() || "";

  if (!serviceUrl) {
    throw new Error(`Missing service configuration. Set ${envName} in the project .env or .env.local.`);
  }

  return serviceUrl.replace(/\/+$/, "");
}

function appendQuery(path: string, query: NextApiRequest["query"]) {
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

function copyRequestHeaders(req: NextApiRequest, adminWrite: boolean) {
  const headers: Record<string, string> = {
    accept: "application/json",
  };

  const contentType = req.headers["content-type"];
  if (typeof contentType === "string") headers["content-type"] = contentType;

  const idempotencyKey = req.headers["idempotency-key"];
  if (typeof idempotencyKey === "string") headers["idempotency-key"] = idempotencyKey;

  const role = req.headers["x-role"] || req.headers["x-user-role"];
  if (typeof role === "string") headers["x-role"] = role;
  if (adminWrite && !headers["x-role"]) headers["x-role"] = "admin";

  return headers;
}

function responseMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
      return (error as { message: string }).message;
    }
    if (typeof (payload as { message?: unknown }).message === "string") return (payload as { message: string }).message;
  }
  return fallback;
}

export async function proxyToGateway(req: NextApiRequest, res: NextApiResponse, options: ProxyOptions) {
  const method = String(req.method || "GET").toUpperCase();
  if (options.methods && !options.methods.includes(method)) {
    res.setHeader("Allow", options.methods.join(", "));
    return res.status(405).json({ error: { message: "Method not allowed." } });
  }

  const targetPath = appendQuery(options.targetPath, req.query);
  const targetUrl = `${gatewayBaseUrl()}${targetPath}`;
  const hasBody = !["GET", "HEAD"].includes(method);

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers: copyRequestHeaders(req, Boolean(options.adminWrite && method !== "GET")),
      body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
    });
    const text = await upstream.text();
    const payload = text
      ? (() => {
          try {
            return JSON.parse(text);
          } catch {
            return { message: text };
          }
        })()
      : null;
    return res.status(upstream.status).json(payload ?? {});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reach backend gateway.";
    return res.status(503).json({
      ok: false,
      error: {
        message: responseMessage(null, `Backend gateway unavailable: ${message}`),
      },
    });
  }
}

export async function proxyToService(req: NextApiRequest, res: NextApiResponse, options: ServiceProxyOptions) {
  const method = String(req.method || "GET").toUpperCase();
  if (options.methods && !options.methods.includes(method)) {
    res.setHeader("Allow", options.methods.join(", "));
    return res.status(405).json({ error: { message: "Method not allowed." } });
  }

  const hasBody = !["GET", "HEAD"].includes(method);

  try {
    const targetPath = appendQuery(options.targetPath, req.query);
    const targetUrl = `${serviceBaseUrl(options.baseUrlEnv, options.fallbackBaseUrl)}${targetPath}`;
    const upstream = await fetch(targetUrl, {
      method,
      headers: copyRequestHeaders(req, Boolean(options.adminWrite && method !== "GET")),
      body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
    });
    const text = await upstream.text();
    const payload = text
      ? (() => {
          try {
            return JSON.parse(text);
          } catch {
            return { message: text };
          }
        })()
      : {};

    return res.status(upstream.status).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reach backend service.";
    return res.status(503).json({
      ok: false,
      error: {
        message: `Backend service unavailable: ${message}`,
      },
    });
  }
}
