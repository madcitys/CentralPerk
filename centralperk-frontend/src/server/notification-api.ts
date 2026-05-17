import { z } from "zod";
import { queueMemberNotification } from "../app/lib/notifications";
import { HttpError } from "./http-error";
import { createApiHandler } from "./route-utils";
import { resolveAudienceMembers } from "./segment-preview";
import { serviceBaseUrl } from "./service-proxy";

const audienceSchema = z
  .object({
    subject: z.string().trim().min(1).max(160),
    message: z.string().trim().min(1).max(2_000),
    segment: z.string().trim().max(80).optional(),
    memberId: z.string().trim().max(80).optional(),
    email: z.string().trim().email().max(254).optional(),
  })
  .strict();

const markReadSchema = z.object({}).strict();

async function requestNotificationService<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${serviceBaseUrl("NOTIFICATION_SERVICE_URL", "http://127.0.0.1:4005")}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : typeof payload?.error?.message === "string"
          ? payload.error.message
          : `Notification service failed (${response.status}).`;
    throw new HttpError(response.status, message);
  }
  return payload as T;
}

async function queueAudience(channel: "sms" | "email", input: z.infer<typeof audienceSchema>) {
  const members = await resolveAudienceMembers({
    segment: input.segment,
    memberId: input.memberId,
    email: input.email,
  });

  if (members.length === 0) {
    throw new HttpError(404, "No matching audience members were found.");
  }

  const results = await Promise.all(
    members.map((member) =>
      queueMemberNotification({
        memberId: member.memberNumber,
        channel,
        subject: input.subject,
        message: input.message,
        isTransactional: false,
      }),
    ),
  );

  return results.filter((result) => result.queued).length;
}

export const notificationsHandler = createApiHandler({
  route: "/api/notifications",
  methods: ["GET"] as const,
  rateLimit: { limit: 60, windowMs: 60_000 },
  handler: async ({ req }) => {
    const memberId = typeof req.query.memberId === "string" ? req.query.memberId.trim() : undefined;
    const email = typeof req.query.email === "string" ? req.query.email.trim() : undefined;
    const limit = typeof req.query.limit === "string" ? Math.min(100, Math.max(1, Number(req.query.limit) || 20)) : 20;
    const params = new URLSearchParams({ limit: String(limit) });
    if (memberId) params.set("memberId", memberId);
    if (email) params.set("email", email);
    return requestNotificationService(`/notifications?${params.toString()}`);
  },
});

export const triggerSmsHandler = createApiHandler({
  route: "/api/notifications/sms",
  methods: ["POST"] as const,
  schema: audienceSchema,
  rateLimit: { limit: 20, windowMs: 60_000 },
  resolveActor: (body) => body.memberId || body.email || body.segment || "audience",
  summarize: (body) => ({
    segment: body.segment || null,
    memberId: body.memberId || null,
    email: body.email || null,
  }),
  handler: async ({ body }) => ({
    ok: true as const,
    queued: await queueAudience("sms", body),
  }),
});

export const markNotificationReadHandler = createApiHandler({
  route: "/api/notifications/:id/read",
  methods: ["PATCH"] as const,
  schema: markReadSchema,
  rateLimit: { limit: 60, windowMs: 60_000 },
  handler: async ({ req }) => {
    const id = String(req.query.id || "").trim();
    if (!id) throw new HttpError(400, "Notification ID is required.");

    return requestNotificationService(`/notifications/${encodeURIComponent(id)}/read`, {
      method: "PATCH",
      body: JSON.stringify({}),
    });
  },
});
