import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { ZodError, type z } from "zod";
import { appendAuditLog } from "./audit-log";
import { HttpError } from "./http-error";
import { checkRateLimit } from "./rate-limit";

type ApiHandlerContext<TBody> = {
  req: NextApiRequest;
  res: NextApiResponse;
  body: TBody;
};

type ApiHandlerOptions<TBody> = {
  route: string;
  methods: readonly string[];
  schema?: z.ZodType<TBody>;
  rateLimit?: {
    limit: number;
    windowMs: number;
  };
  resolveActor?: (body: TBody, req: NextApiRequest) => string | null | undefined;
  summarize?: (body: TBody, req: NextApiRequest) => Record<string, unknown>;
  handler: (ctx: ApiHandlerContext<TBody>) => Promise<unknown>;
};

function normalizeBody(body: unknown) {
  if (body === undefined || body === null || body === "") return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

export function getClientIp(req: NextApiRequest) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  if (Array.isArray(forwardedFor) && forwardedFor[0]) {
    return forwardedFor[0];
  }
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) return realIp.trim();
  return req.socket.remoteAddress || "unknown";
}

export function getIdempotencyKey(req: NextApiRequest) {
  const raw = req.headers["idempotency-key"];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}

export function createApiHandler<TBody = Record<string, never>>(
  options: ApiHandlerOptions<TBody>,
): NextApiHandler {
  return async (req, res) => {
    const startedAt = Date.now();
    const ip = getClientIp(req);
    const method = req.method?.toUpperCase() || "GET";
    let parsedBody = {} as TBody;
    let actor: string | null = null;
    let statusCode = 200;
    let auditSummary: Record<string, unknown> = {};
    let auditError: string | null = null;

    try {
      if (!options.methods.includes(method)) {
        res.setHeader("Allow", options.methods);
        throw new HttpError(405, `Method ${method} is not allowed for ${options.route}.`);
      }

      parsedBody = options.schema
        ? options.schema.parse(normalizeBody(req.body))
        : (normalizeBody(req.body) as TBody);

      actor = options.resolveActor?.(parsedBody, req) ?? null;
      auditSummary = options.summarize?.(parsedBody, req) ?? {};

      if (options.rateLimit) {
        const ipRate = checkRateLimit({
          key: `${options.route}:ip:${ip}`,
          limit: options.rateLimit.limit,
          windowMs: options.rateLimit.windowMs,
        });

        const actorRate =
          actor
            ? checkRateLimit({
                key: `${options.route}:actor:${actor}`,
                limit: options.rateLimit.limit,
                windowMs: options.rateLimit.windowMs,
              })
            : null;

        const remaining = Math.min(
          ipRate.remaining,
          actorRate?.remaining ?? ipRate.remaining,
        );
        const resetAt = Math.max(ipRate.resetAt, actorRate?.resetAt ?? ipRate.resetAt);

        res.setHeader("X-RateLimit-Limit", String(options.rateLimit.limit));
        res.setHeader("X-RateLimit-Remaining", String(remaining));
        res.setHeader("X-RateLimit-Reset", String(resetAt));

        if (!ipRate.allowed || (actorRate && !actorRate.allowed)) {
          statusCode = 429;
          res.status(429).json({
            error: "Too many requests. Please wait and try again.",
          });
          return;
        }
      }

      const result = await options.handler({ req, res, body: parsedBody });
      if (!res.writableEnded) {
        res.status(statusCode).json(result);
      }
      statusCode = res.statusCode || statusCode;
    } catch (error) {
      if (error instanceof ZodError) {
        statusCode = 400;
        auditError = "Validation failed";
        res.status(400).json({
          error: "Validation failed.",
          details: error.flatten(),
        });
      } else if (error instanceof HttpError) {
        statusCode = error.statusCode;
        auditError = error.message;
        res.status(error.statusCode).json({
          error: error.message,
        });
      } else {
        statusCode = 500;
        auditError = error instanceof Error ? error.message : "Unexpected server error";
        res.status(500).json({
          error: auditError,
        });
      }
    } finally {
      await appendAuditLog({
        route: options.route,
        method,
        ip,
        actor,
        statusCode,
        durationMs: Date.now() - startedAt,
        createdAt: new Date().toISOString(),
        summary: auditSummary,
        idempotencyKey: getIdempotencyKey(req),
        error: auditError,
      }).catch(() => undefined);
    }
  };
}
