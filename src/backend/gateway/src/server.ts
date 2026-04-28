import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import type { IncomingHttpHeaders } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { checkRateLimit } from "./rate-limit.js";

function buildTarget(base: string, path: string) {
  return `${base.replace(/\/+$/, "")}${path}`;
}

function withQuery(reqUrl: string, nextPath: string) {
  const queryIndex = reqUrl.indexOf("?");
  return queryIndex >= 0 ? `${nextPath}${reqUrl.slice(queryIndex)}` : nextPath;
}

function isCampaignWrite(url: string, method: string) {
  if (method === "GET") return false;
  return url.startsWith("/campaigns");
}

function hasAdmin(headers: IncomingHttpHeaders) {
  const role = String(headers["x-role"] || headers["x-user-role"] || "").toLowerCase();
  return role === config.adminRole;
}

async function proxy(req: FastifyRequest, reply: FastifyReply, targetBase: string) {
  return proxyWithPath(req, reply, targetBase, req.url);
}

async function proxyWithPath(req: FastifyRequest, reply: FastifyReply, targetBase: string, targetPath: string) {
  const url = buildTarget(targetBase, targetPath);
  let body: string | ArrayBuffer | undefined;
  if (!["GET", "HEAD"].includes(req.method.toUpperCase())) {
    if (req.body === undefined || req.body === null) {
      body = undefined;
    } else if (typeof req.body === "string" || Buffer.isBuffer(req.body)) {
      body = typeof req.body === "string"
        ? req.body
        : req.body.buffer.slice(req.body.byteOffset, req.body.byteOffset + req.body.byteLength) as ArrayBuffer;
    } else {
      body = JSON.stringify(req.body);
    }
  }
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    const normalizedKey = key.toLowerCase();
    if (["host", "content-length", "connection", "accept-encoding", "expect"].includes(normalizedKey)) continue;
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, String(entry));
    } else if (value !== undefined) {
      headers.set(key, String(value));
    }
  }
  try {
    const res = await fetch(url, {
      method: req.method,
      headers,
      body,
    });
    reply.status(res.status);
    res.headers.forEach((v, k) => {
      if (["content-encoding", "content-length", "transfer-encoding", "connection"].includes(k.toLowerCase())) return;
      reply.header(k, v);
    });
    const ab = await res.arrayBuffer();
    reply.send(Buffer.from(ab));
  } catch (error) {
    req.log.error({ err: error, target: targetBase, path: req.url }, "Gateway upstream request failed");
    reply.code(502).send({
      ok: false,
      error: "upstream_unavailable",
      upstream: targetBase,
      path: req.url,
    });
  }
}

export function createServer() {
  const app = Fastify({ logger: true });

  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(String(body || ""))));
  });
  app.addContentTypeParser("text/plain", { parseAs: "string" }, (_req, body, done) => {
    const text = String(body || "").trim();
    if (!text) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(text));
    } catch {
      done(null, text);
    }
  });

  const pointsTarget = () => (config.useLocalRuntime ? config.nextApiUrl : config.pointsUrl);
  const campaignTarget = () => (config.useLocalRuntime ? config.nextApiUrl : config.campaignUrl);
  const memberTarget = () => (config.useLocalRuntime ? config.nextApiUrl : config.memberUrl);
  const segmentTarget = () => (config.useLocalRuntime ? config.nextApiUrl : config.segmentUrl);
  const rewardTarget = () => (config.useLocalRuntime ? config.nextApiUrl : config.rewardUrl);
  const notificationTarget = () => (config.useLocalRuntime ? config.nextApiUrl : config.notificationUrl);
  const backendApiTarget = () => config.backendApiUrl;
  const nextApiTarget = () => config.nextApiUrl;

  const proxyToNextApi = async (req: FastifyRequest, reply: FastifyReply) => proxy(req, reply, nextApiTarget());
  const proxyToBackendApi = async (req: FastifyRequest, reply: FastifyReply) => proxy(req, reply, backendApiTarget());

  app.get("/health", async () => ({
    ok: true,
    mode: config.useLocalRuntime ? "local_runtime" : "microservices",
    upstreams: {
      points: pointsTarget(),
      campaign: campaignTarget(),
      members: memberTarget(),
      segments: segmentTarget(),
      notifications: notificationTarget(),
      rewards: rewardTarget(),
      backendApi: backendApiTarget(),
      nextApi: config.nextApiUrl,
      pointsEngine: config.pointsUrl,
      campaignService: config.campaignUrl,
      memberService: config.memberUrl,
      segmentService: config.segmentUrl,
      notificationService: config.notificationUrl,
      rewardService: config.rewardUrl,
    },
  }));

  app.all("/points/*", async (req, reply) => {
    if (req.url.startsWith("/points/award")) {
      const key = (req.ip || "global").toString();
      if (!checkRateLimit(key, 1000, 60_000)) {
        reply.code(429).send({ ok: false, error: "rate_limited" });
        return;
      }
    }
    return proxy(req, reply, pointsTarget());
  });

  app.addHook("preHandler", async (req, reply) => {
    if (!config.useLocalRuntime && isCampaignWrite(req.url, req.method) && !hasAdmin(req.headers)) {
      reply.code(403).send({ ok: false, error: "forbidden" });
      return reply;
    }
  });

  app.all("/campaigns", async (req, reply) => proxy(req, reply, campaignTarget()));
  app.all("/campaigns/*", async (req, reply) => proxy(req, reply, campaignTarget()));
  app.get("/tiers", async (req, reply) =>
    proxyWithPath(req, reply, pointsTarget(), withQuery(req.url, "/points/tiers")),
  );
  app.get("/tiers/rules", async (req, reply) =>
    proxyWithPath(req, reply, pointsTarget(), withQuery(req.url, "/points/tiers")),
  );
  app.all("/segments", async (req, reply) => proxy(req, reply, segmentTarget()));
  app.all("/segments/*", async (req, reply) => proxy(req, reply, segmentTarget()));
  app.all("/members", async (req, reply) => proxy(req, reply, memberTarget()));
  app.all("/members/:id/points", proxyToBackendApi);
  app.all("/members/:id/points-history", proxyToBackendApi);
  app.all("/members/*", async (req, reply) => proxy(req, reply, memberTarget()));
  app.all("/notifications", proxyToBackendApi);
  app.all("/notifications/*", proxyToBackendApi);
  app.all("/communications/*", proxyToBackendApi);
  app.all("/analytics/*", proxyToBackendApi);
  app.all("/partners", proxyToBackendApi);
  app.all("/partners/*", proxyToBackendApi);
  app.all("/events/*", proxyToBackendApi);
  app.all("/unsubscribe", proxyToBackendApi);
  app.all("/rewards", async (req, reply) => proxy(req, reply, rewardTarget()));
  app.all("/rewards/*", async (req, reply) => proxy(req, reply, rewardTarget()));

  return app;
}

function isEntrypoint() {
  return process.argv[1] ? path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]) : false;
}

if (isEntrypoint()) {
  const app = createServer();
  app
    .listen({ host: config.host, port: config.port })
    .then((address) => app.log.info({ address }, "Gateway listening"))
    .catch((err) => {
      app.log.error(err);
      process.exit(1);
    });
}
