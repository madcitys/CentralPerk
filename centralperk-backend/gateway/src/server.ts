import Fastify from "fastify";
import { pathToFileURL } from "node:url";
import { config } from "./config.js";
import { checkRateLimit } from "./rate-limit.js";

function buildTarget(base: string, path: string) {
  return `${base.replace(/\/+$/, "")}${path}`;
}

function dependencies() {
  return [
    { name: "member-service", url: config.memberUrl },
    { name: "segment-service", url: config.segmentUrl },
    { name: "campaign-service", url: config.campaignUrl },
    { name: "notification-service", url: config.notificationUrl },
    { name: "reward-service", url: config.rewardUrl },
    { name: "points-engine", url: config.pointsUrl },
  ];
}

async function checkDependency(name: string, baseUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(buildTarget(baseUrl, "/health/db"), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    return {
      name,
      url: baseUrl,
      ok: response.ok,
      statusCode: response.status,
    };
  } catch (error) {
    return {
      name,
      url: baseUrl,
      ok: false,
      error: error instanceof Error ? error.message : "unreachable",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkDependencies() {
  return Promise.all(dependencies().map((dependency) => checkDependency(dependency.name, dependency.url)));
}

function proxyHeaders(headers: Record<string, any>) {
  const blocked = new Set(["host", "content-length", "connection", "keep-alive", "transfer-encoding", "upgrade", "expect"]);
  const next: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (blocked.has(lowerKey)) continue;
    if (Array.isArray(value)) {
      next[key] = value.join(", ");
    } else if (value !== undefined && value !== null) {
      next[key] = String(value);
    }
  }

  return next;
}

function isCampaignWrite(url: string, method: string) {
  if (method === "GET") return false;
  return url.startsWith("/campaigns");
}

function hasAdmin(headers: Record<string, any>) {
  const role = String(headers["x-role"] || headers["x-user-role"] || "").toLowerCase();
  return role === config.adminRole;
}

async function proxy(req: any, reply: any, targetBase: string) {
  const url = buildTarget(targetBase, req.url);
  let body: any = undefined;
  if (!["GET", "HEAD"].includes(req.method.toUpperCase())) {
    if (req.body === undefined || req.body === null) {
      body = undefined;
    } else if (typeof req.body === "string" || Buffer.isBuffer(req.body)) {
      body = req.body;
    } else {
      body = JSON.stringify(req.body);
    }
  }
  try {
    const res = await fetch(url, {
      method: req.method,
      headers: proxyHeaders(req.headers),
      body,
    });
    reply.status(res.status);
    res.headers.forEach((v, k) => reply.header(k, v));
    const ab = await res.arrayBuffer();
    reply.send(Buffer.from(ab));
  } catch (error) {
    reply.code(503).send({
      ok: false,
      error: {
        message: `Upstream service unavailable: ${targetBase}`,
        detail: error instanceof Error ? error.message : "fetch failed",
      },
    });
  }
}

export function createServer() {
  const app = Fastify({ logger: true });

  app.get("/health", async (_req, reply) => {
    const dependencyStatuses = await checkDependencies();
    const healthy = dependencyStatuses.every((dependency) => dependency.ok);
    if (!healthy) reply.code(503);
    return {
      status: healthy ? "ok" : "degraded",
      service: config.serviceName,
      dbMode: config.dbMode,
      schema: null,
      dependencies: dependencyStatuses,
    };
  });

  app.get("/", async () => ({
    status: "ok",
    service: config.serviceName,
    health: "/health",
    routes: [
      "/points/*",
      "/campaigns/*",
      "/engagement/*",
      "/members/*",
      "/referrals/*",
      "/feedback",
      "/feedback-insights/*",
      "/birthday-settings",
      "/birthday-rewards/*",
      "/badges/*",
      "/tier-history",
      "/reengagement-actions/*",
      "/social-share-events/*",
      "/segments/*",
      "/notifications/*",
      "/notification-campaigns/*",
      "/notification-templates",
      "/communications/*",
      "/rewards/*",
      "/partners/*",
      "/reward-partners/*",
      "/vouchers/*",
      "/winback-campaigns",
    ],
  }));

  app.all("/points/*", async (req, reply) => {
    if (req.url.startsWith("/points/award")) {
      const key = (req.ip || "global").toString();
      if (!checkRateLimit(key, 1000, 60_000)) {
        reply.code(429).send({ ok: false, error: "rate_limited" });
        return;
      }
    }
    return proxy(req, reply, config.pointsUrl);
  });

  app.addHook("preHandler", async (req, reply) => {
    if (isCampaignWrite(req.url, req.method) && !hasAdmin(req.headers)) {
      reply.code(403).send({ ok: false, error: "forbidden" });
      return reply;
    }
  });

  app.all("/campaigns", async (req, reply) => proxy(req, reply, config.campaignUrl));
  app.all("/campaigns/*", async (req, reply) => proxy(req, reply, config.campaignUrl));
  app.all("/engagement", async (req, reply) => proxy(req, reply, config.memberUrl));
  app.all("/engagement/*", async (req, reply) => proxy(req, reply, config.memberUrl));
  app.all("/members", async (req, reply) => proxy(req, reply, config.memberUrl));
  app.all("/members/*", async (req, reply) => proxy(req, reply, config.memberUrl));
  app.all("/referrals", async (req, reply) => proxy(req, reply, config.memberUrl));
  app.all("/referrals/*", async (req, reply) => proxy(req, reply, config.memberUrl));
  app.all("/feedback", async (req, reply) => proxy(req, reply, config.memberUrl));
  app.all("/feedback-insights/*", async (req, reply) => proxy(req, reply, config.memberUrl));
  app.all("/birthday-settings", async (req, reply) => proxy(req, reply, config.memberUrl));
  app.all("/birthday-rewards/*", async (req, reply) => proxy(req, reply, config.memberUrl));
  app.all("/badges/*", async (req, reply) => proxy(req, reply, config.memberUrl));
  app.all("/tier-history", async (req, reply) => proxy(req, reply, config.memberUrl));
  app.all("/reengagement-actions", async (req, reply) => proxy(req, reply, config.memberUrl));
  app.all("/reengagement-actions/*", async (req, reply) => proxy(req, reply, config.memberUrl));
  app.all("/social-share-events", async (req, reply) => proxy(req, reply, config.memberUrl));
  app.all("/social-share-events/*", async (req, reply) => proxy(req, reply, config.memberUrl));
  app.all("/segments", async (req, reply) => proxy(req, reply, config.segmentUrl));
  app.all("/segments/*", async (req, reply) => proxy(req, reply, config.segmentUrl));
  app.all("/notifications", async (req, reply) => proxy(req, reply, config.notificationUrl));
  app.all("/notifications/*", async (req, reply) => proxy(req, reply, config.notificationUrl));
  app.all("/notification-campaigns", async (req, reply) => proxy(req, reply, config.notificationUrl));
  app.all("/notification-campaigns/*", async (req, reply) => proxy(req, reply, config.notificationUrl));
  app.all("/notification-templates", async (req, reply) => proxy(req, reply, config.notificationUrl));
  app.all("/communications/*", async (req, reply) => proxy(req, reply, config.notificationUrl));
  app.all("/rewards", async (req, reply) => proxy(req, reply, config.rewardUrl));
  app.all("/rewards/*", async (req, reply) => proxy(req, reply, config.rewardUrl));
  app.all("/partners/*", async (req, reply) => proxy(req, reply, config.rewardUrl));
  app.all("/reward-partners", async (req, reply) => proxy(req, reply, config.rewardUrl));
  app.all("/reward-partners/*", async (req, reply) => proxy(req, reply, config.rewardUrl));
  app.all("/vouchers", async (req, reply) => proxy(req, reply, config.rewardUrl));
  app.all("/vouchers/*", async (req, reply) => proxy(req, reply, config.rewardUrl));
  app.all("/winback-campaigns", async (req, reply) => proxy(req, reply, config.campaignUrl));

  return app;
}

const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isDirectRun) {
  const app = createServer();
  app
    .listen({ host: config.host, port: config.port })
    .then((address) => app.log.info({ address }, "Gateway listening"))
    .catch((err) => {
      app.log.error(err);
      process.exit(1);
    });
}
