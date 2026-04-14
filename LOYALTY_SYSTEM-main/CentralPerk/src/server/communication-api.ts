import { z } from "zod";
import { loadCommunicationPreference, saveCommunicationPreference } from "../app/lib/member-lifecycle";
import { queueMemberNotification } from "../app/lib/notifications";
import { createApiHandler } from "./route-utils";
import { resolveAudienceMembers } from "./segment-preview";
import { createServerSupabaseClient } from "./supabase-admin";

const emailSchema = z
  .object({
    subject: z.string().trim().min(1).max(160),
    message: z.string().trim().min(1).max(4_000),
    segment: z.string().trim().max(80).optional(),
    memberId: z.string().trim().max(80).optional(),
    email: z.string().trim().email().max(254).optional(),
    scheduledFor: z.string().datetime().optional(),
  })
  .strict();

async function unsubscribeMember(input: { memberId?: string; email?: string }) {
  const members = await resolveAudienceMembers(input);
  if (members.length === 0) {
    return false;
  }

  for (const member of members) {
    const currentPreference = await loadCommunicationPreference(member.memberNumber, member.email || undefined);
    await saveCommunicationPreference(
      member.memberNumber,
      {
        ...currentPreference,
        promotionalOptIn: false,
        email: false,
      },
      member.email || undefined,
    );
  }

  return true;
}

export const communicationsEmailHandler = createApiHandler({
  route: "/api/communications/email",
  methods: ["POST"] as const,
  schema: emailSchema,
  rateLimit: { limit: 20, windowMs: 60_000 },
  resolveActor: (body) => body.memberId || body.email || body.segment || "audience",
  summarize: (body) => ({
    segment: body.segment || null,
    memberId: body.memberId || null,
    scheduledFor: body.scheduledFor || null,
  }),
  handler: async ({ body }) => {
    const members = await resolveAudienceMembers({
      segment: body.segment,
      memberId: body.memberId,
      email: body.email,
    });

    const results = await Promise.all(
      members.map((member) =>
        queueMemberNotification({
          memberId: member.memberNumber,
          channel: "email",
          subject: body.subject,
          message: body.message,
          isTransactional: false,
        }),
      ),
    );

    return {
      ok: true as const,
      queued: results.filter((result) => result.queued).length,
      scheduledFor: body.scheduledFor ?? null,
    };
  },
});

export const communicationsAnalyticsHandler = createApiHandler({
  route: "/api/communications/analytics",
  methods: ["GET"] as const,
  rateLimit: { limit: 60, windowMs: 60_000 },
  handler: async () => {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("notification_outbox")
      .select("channel,status")
      .limit(5_000);
    if (error) throw error;

    const byChannel: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const row of data || []) {
      const channel = String(row.channel ?? "unknown");
      const status = String(row.status ?? "pending");
      byChannel[channel] = (byChannel[channel] || 0) + 1;
      byStatus[status] = (byStatus[status] || 0) + 1;
    }

    return {
      ok: true as const,
      analytics: {
        total: (data || []).length,
        byChannel,
        byStatus,
      },
    };
  },
});

export const unsubscribeHandler = createApiHandler({
  route: "/api/unsubscribe",
  methods: ["GET", "POST"] as const,
  rateLimit: { limit: 20, windowMs: 60_000 },
  handler: async ({ req, res, body }) => {
    const memberId =
      typeof req.query.memberId === "string"
        ? req.query.memberId.trim()
        : typeof (body as { memberId?: unknown }).memberId === "string"
          ? String((body as { memberId?: unknown }).memberId).trim()
          : undefined;
    const email =
      typeof req.query.email === "string"
        ? req.query.email.trim()
        : typeof (body as { email?: unknown }).email === "string"
          ? String((body as { email?: unknown }).email).trim()
          : undefined;

    const ok = await unsubscribeMember({ memberId, email });

    if (req.method?.toUpperCase() === "GET") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(
        `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px;"><h1>${ok ? "Email unsubscribed" : "No matching member found"}</h1><p>${ok ? "Promotional email preferences were updated successfully." : "We could not find a matching member for this unsubscribe link."}</p></body></html>`,
      );
      return;
    }

    return { ok };
  },
});
