import dotenv from "dotenv";
dotenv.config();

import Fastify from "fastify";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

type NotificationRecord = {
  id: string;
  memberId: string | null;
  email: string | null;
  channel: "email" | "sms" | "push";
  subject: string;
  message: string;
  status: "queued" | "sent" | "read";
  createdAt: string;
  scheduledFor?: string | null;
  trigger?: string | null;
};

const notifications: NotificationRecord[] = [
  {
    id: `NOTIF-${crypto.randomUUID()}`,
    memberId: "MEM-000011",
    email: "soundwave@example.com",
    channel: "email",
    subject: "Double points weekend",
    message: "Double points weekend",
    status: "queued",
    createdAt: new Date(Date.now() - 60_000).toISOString(),
  },
  {
    id: `NOTIF-${crypto.randomUUID()}`,
    memberId: "MEM-000022",
    email: null,
    channel: "sms",
    subject: "Reward expiring soon",
    message: "Reward expiring soon",
    status: "sent",
    createdAt: new Date(Date.now() - 120_000).toISOString(),
  },
];

function parseLimit(value: unknown, fallback = 20) {
  const limit = Number(value ?? fallback);
  if (!Number.isFinite(limit)) return fallback;
  return Math.min(100, Math.max(1, Math.floor(limit)));
}

function normalizeString(value: unknown) {
  const next = String(value ?? "").trim();
  return next || null;
}

function createNotification(input: {
  memberId?: unknown;
  email?: unknown;
  channel: NotificationRecord["channel"];
  subject?: unknown;
  message?: unknown;
  trigger?: unknown;
  scheduledFor?: unknown;
}) {
  const subject = String(input.subject ?? "").trim() || "Loyalty update";
  const message = String(input.message ?? "").trim() || subject;

  const record: NotificationRecord = {
    id: `NOTIF-${crypto.randomUUID()}`,
    memberId: normalizeString(input.memberId),
    email: normalizeString(input.email)?.toLowerCase() ?? null,
    channel: input.channel,
    subject,
    message,
    status: "queued",
    createdAt: new Date().toISOString(),
    scheduledFor: normalizeString(input.scheduledFor),
    trigger: normalizeString(input.trigger),
  };

  notifications.unshift(record);
  if (notifications.length > 500) notifications.length = 500;
  return record;
}

export function createServer() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true, service: "notification-service" }));

  app.get("/notifications", async (request) => {
    const query = request.query as {
      limit?: string;
      memberId?: string;
      email?: string;
      channel?: string;
    };

    const memberId = normalizeString(query.memberId);
    const email = normalizeString(query.email)?.toLowerCase() ?? null;
    const channel = normalizeString(query.channel)?.toLowerCase() ?? null;

    return {
      ok: true,
      notifications: notifications
        .filter((entry) => (memberId ? entry.memberId === memberId : true))
        .filter((entry) => (email ? entry.email === email : true))
        .filter((entry) => (channel ? entry.channel === channel : true))
        .slice(0, parseLimit(query.limit))
        .map((entry) => ({
          ...entry,
          title: entry.subject,
        })),
    };
  });

  app.post("/notifications/sms", async (request) => {
    const body = (request.body || {}) as Record<string, unknown>;
    const notification = createNotification({
      ...body,
      channel: "sms",
    });

    return {
      ok: true,
      queued: 1,
      notification,
      result: { queued: true, channel: "sms" },
    };
  });

  app.post("/notifications/email", async (request) => {
    const body = (request.body || {}) as Record<string, unknown>;
    const notification = createNotification({
      ...body,
      channel: "email",
    });

    return {
      ok: true,
      queued: 1,
      notification,
      result: { queued: true, channel: "email" },
      scheduledFor: notification.scheduledFor ?? null,
    };
  });

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
