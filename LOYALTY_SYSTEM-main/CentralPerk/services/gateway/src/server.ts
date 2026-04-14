import Fastify from "fastify";
import { config } from "./config.js";
import { checkRateLimit } from "./rate-limit.js";

function buildTarget(base: string, path: string) {
  return `${base.replace(/\/+$/, "")}${path}`;
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
  const res = await fetch(url, {
    method: req.method,
    headers: { ...req.headers, host: undefined },
    body,
  });
  reply.status(res.status);
  res.headers.forEach((v, k) => reply.header(k, v));
  const ab = await res.arrayBuffer();
  reply.send(Buffer.from(ab));
}

export function createServer() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true, upstreams: { points: config.pointsUrl, campaign: config.campaignUrl } }));

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

  return app;
}

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === process.argv[1]) {
  const app = createServer();
  app
    .listen({ host: config.host, port: config.port })
    .then((address) => app.log.info({ address }, "Gateway listening"))
    .catch((err) => {
      app.log.error(err);
      process.exit(1);
    });
}
