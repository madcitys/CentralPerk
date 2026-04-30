import dotenv from "dotenv";
dotenv.config();

import Fastify from "fastify";
import path from "path";
import { fileURLToPath } from "url";

const notifications = [
  {
    id: "NOTIF-001",
    memberId: "MEM-000011",
    channel: "email",
    title: "Double points weekend",
    status: "queued",
    createdAt: new Date(Date.now() - 60_000).toISOString(),
  },
  {
    id: "NOTIF-002",
    memberId: "MEM-000022",
    channel: "sms",
    title: "Reward expiring soon",
    status: "sent",
    createdAt: new Date(Date.now() - 120_000).toISOString(),
  },
];

function parseLimit(value: unknown, fallback = 20) {
  const limit = Number(value ?? fallback);
  if (!Number.isFinite(limit)) return fallback;
  return Math.min(100, Math.max(1, Math.floor(limit)));
}

export function createServer() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true, service: "notification-service" }));

  app.get("/notifications", async (request) => {
    const query = request.query as { limit?: string };
    return {
      ok: true,
      notifications: notifications.slice(0, parseLimit(query.limit)),
    };
  });

  app.post("/notifications/sms", async () => ({
    ok: true,
    result: { queued: true, channel: "sms" },
  }));

  app.patch("/notifications/:id/read", async (request, reply) => {
    const params = request.params as { id?: string };
    const notification = notifications.find((entry) => entry.id === params.id);

    if (!notification) {
      reply.code(404);
      return { ok: false, error: "notification_not_found" };
    }

    notification.status = "read";
    return { ok: true, notification };
  });

  return app;
}

function isEntrypoint() {
  return process.argv[1] ? path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]) : false;
}

if (isEntrypoint()) {
  const app = createServer();
  app
    .listen({ host: process.env.HOST || "0.0.0.0", port: Number(process.env.PORT || 4005) })
    .then((address) => app.log.info({ address }, "Notification service listening"))
    .catch((err) => {
      app.log.error(err);
      process.exit(1);
    });
}
