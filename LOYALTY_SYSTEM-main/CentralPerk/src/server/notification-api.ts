import { z } from "zod";
import { queueMemberNotification } from "../app/lib/notifications";
import { HttpError } from "./http-error";
import { createApiHandler } from "./route-utils";
import { resolveAudienceMembers } from "./segment-preview";
import { createServerSupabaseClient } from "./supabase-admin";
import {
  listLocalNotifications,
  markLocalNotificationRead,
  queueLocalMemberNotification,
} from "./local-notifications";

const audienceSchema = z
  .object({
    subject: z.string().trim().min(1).max(160).optional(),
    message: z.string().trim().min(1).max(2_000),
    trigger: z.string().trim().max(80).optional(),
    segment: z.string().trim().max(80).optional(),
    memberId: z.string().trim().max(80).optional(),
    email: z.string().trim().email().max(254).optional(),
  })
  .strict();

const markReadSchema = z.object({}).strict();

function useLocalRuntimeFirst() {
  return (
    process.env.USE_REMOTE_LOYALTY_API !== "true" &&
    (process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true" || process.env.USE_LOCAL_LOYALTY_API === "true")
  );
}

async function lookupMemberPk(input: { memberId?: string; email?: string }) {
  const supabase = createServerSupabaseClient();

  if (input.memberId) {
    const member = await supabase
      .from("loyalty_members")
      .select("id")
      .eq("member_number", input.memberId)
      .limit(1)
      .maybeSingle();
    if (member.error) throw member.error;
    if (member.data?.id !== undefined) return Number(member.data.id);
  }

  if (input.email) {
    const member = await supabase
      .from("loyalty_members")
      .select("id")
      .ilike("email", input.email)
      .limit(1)
      .maybeSingle();
    if (member.error) throw member.error;
    if (member.data?.id !== undefined) return Number(member.data.id);
  }

  return null;
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

  if (useLocalRuntimeFirst()) {
    const subject = input.subject || (input.trigger ? `Loyalty ${input.trigger}` : "Loyalty notification");
    const results = await Promise.all(
      members.map((member) =>
        queueLocalMemberNotification({
          memberId: member.memberNumber,
          channel,
          subject,
          message: input.message,
          isTransactional: false,
        }),
      ),
    );
    return results.filter((result) => result.queued).length;
  }

  const subject = input.subject || (input.trigger ? `Loyalty ${input.trigger}` : "Loyalty notification");
  const results = await Promise.all(
    members.map((member) =>
      queueMemberNotification({
        memberId: member.memberNumber,
        channel,
        subject,
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
    if (useLocalRuntimeFirst()) {
      return {
        ok: true as const,
        notifications: await listLocalNotifications({ memberId, limit }),
        source: "local_runtime",
      };
    }

    try {
      const memberPk = await lookupMemberPk({ memberId, email });
      const supabase = createServerSupabaseClient();

      let query = supabase
        .from("notification_outbox")
        .select("id,subject,message,created_at,status,member_id")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (memberPk !== null) {
        query = query.eq("member_id", memberPk);
      } else if (memberId || email) {
        query = query.is("member_id", null);
      }

      const { data, error } = await query;
      if (error) throw error;

      return {
        ok: true as const,
        notifications: (data || []).map((row) => ({
          id: String(row.id ?? ""),
          subject: String(row.subject ?? "Notification"),
          message: String(row.message ?? ""),
          createdAt: String(row.created_at ?? new Date().toISOString()),
          status: String(row.status ?? "pending"),
        })),
      };
    } catch {
      return {
        ok: true as const,
        notifications: await listLocalNotifications({ memberId, limit }),
        source: "local_runtime",
      };
    }
  },
});

export const triggerSmsHandler = createApiHandler({
  route: "/api/notifications/sms",
  methods: ["POST"] as const,
  schema: audienceSchema,
  parseBodyFromQuery: true,
  rateLimit: { limit: 20, windowMs: 60_000 },
  resolveActor: (body) => body.memberId || body.email || body.segment || "audience",
  summarize: (body) => ({
    trigger: body.trigger || null,
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

    if (useLocalRuntimeFirst()) {
      await markLocalNotificationRead(id);
      return { ok: true as const, source: "local_runtime" };
    }

    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("notification_outbox").update({ status: "read" }).eq("id", id);
    if (error) {
      await markLocalNotificationRead(id);
      return { ok: true as const, source: "local_runtime" };
    }

    return { ok: true as const };
  },
});
