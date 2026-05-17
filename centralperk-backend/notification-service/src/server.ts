import Fastify from "fastify";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { config } from "./config.js";
import { supabase } from "./supabase-client.js";

const notificationSchema = z.object({
  memberId: z.union([z.string(), z.number()]).optional(),
  channel: z.string().trim().min(1).max(40),
  subject: z.string().trim().max(160).optional(),
  body: z.string().trim().min(1).max(2000),
  status: z.string().trim().max(40).optional(),
});

const notificationCampaignSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(1).max(160).optional(),
  trigger: z.string().trim().max(80).optional(),
  segment: z.string().trim().max(80).optional(),
  scheduledFor: z.string().trim().max(80).optional(),
  audienceSize: z.number().int().min(0).optional(),
  variantA: z.string().trim().max(2000).optional(),
  variantB: z.string().trim().max(2000).optional(),
  status: z.string().trim().max(40).optional(),
  sentCount: z.number().int().min(0).optional(),
  deliveredCount: z.number().int().min(0).optional(),
  openedCount: z.number().int().min(0).optional(),
  winner: z.string().trim().max(20).optional(),
});

function tableMissing(error: unknown, table: string) {
  const message = String((error as { message?: unknown; details?: unknown; hint?: unknown })?.message ?? "").toLowerCase();
  return message.includes(table.toLowerCase()) && (message.includes("does not exist") || message.includes("schema cache"));
}

export function createServer() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({
    status: "ok",
    service: config.serviceName,
    dbMode: config.dbMode,
    schema: config.schema,
  }));

  app.get("/health/db", async (_request, reply) => {
    const { error } = await supabase.from("notification_outbox").select("id").limit(1);
    if (error) {
      reply.code(503).send({
        status: "error",
        service: config.serviceName,
        dbMode: config.dbMode,
        schema: config.schema,
        database: { connected: false, check: "notification_outbox" },
      });
      return;
    }

    return {
      status: "ok",
      service: config.serviceName,
      dbMode: config.dbMode,
      schema: config.schema,
      database: { connected: true, check: "notification_outbox" },
    };
  });

  app.get("/notifications", async (request) => {
    const query = request.query as Record<string, any>;
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20) || 20));
    let builder = supabase
      .from("notification_outbox")
      .select("id,subject,message,created_at,status,member_id,user_id,channel")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (query.memberId && Number.isFinite(Number(query.memberId))) {
      builder = builder.eq("member_id", Number(query.memberId));
    }

    const { data, error } = await builder;
    if (error) throw error;
    return {
      ok: true,
      notifications: (data || []).map((row: any) => ({
        id: String(row.id ?? ""),
        subject: String(row.subject ?? "Notification"),
        message: String(row.message ?? ""),
        createdAt: String(row.created_at ?? new Date().toISOString()),
        created_at: String(row.created_at ?? new Date().toISOString()),
        status: String(row.status ?? "pending"),
        member_id: row.member_id ?? null,
        user_id: row.user_id ?? null,
        channel: row.channel ?? null,
      })),
    };
  });

  app.post("/notifications", async (request) => {
    const body = notificationSchema.parse(request.body);
    const { data, error } = await supabase
      .from("notification_outbox")
      .insert({
        member_id: body.memberId !== undefined && Number.isFinite(Number(body.memberId)) ? Number(body.memberId) : null,
        channel: body.channel,
        subject: body.subject ?? null,
        message: body.body,
        status: body.status ?? "queued",
      })
      .select("*")
      .single();
    if (error) throw error;
    return { ok: true, notification: data };
  });

  app.patch("/notifications/:id/read", async (request, reply) => {
    const id = String((request.params as any).id || "").trim();
    if (!id) {
      reply.code(400).send({ ok: false, error: "notification_id_required" });
      return;
    }
    const { error } = await supabase.from("notification_outbox").update({ status: "read" }).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

  app.get("/communications/analytics", async () => {
    const { data, error } = await supabase.from("notification_outbox").select("channel,status").limit(5000);
    if (error) throw error;

    const byChannel: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const row of data || []) {
      const channel = String((row as any).channel ?? "unknown");
      const status = String((row as any).status ?? "pending");
      byChannel[channel] = (byChannel[channel] || 0) + 1;
      byStatus[status] = (byStatus[status] || 0) + 1;
    }

    return { ok: true, analytics: { total: (data || []).length, byChannel, byStatus } };
  });

  app.get("/notification-templates", async () => {
    const { data, error } = await supabase
      .from("notification_templates")
      .select("id,template_name,trigger_event,subject,message")
      .eq("is_active", true)
      .order("template_name", { ascending: true });
    if (error) {
      if (tableMissing(error, "notification_templates")) return { ok: true, templates: [] };
      throw error;
    }
    return { ok: true, templates: data || [] };
  });

  app.get("/notification-campaigns", async () => {
    const { data, error } = await supabase
      .from("notification_campaigns")
      .select("id,campaign_name,trigger_event,segment,scheduled_for,status,audience_size,sent_count,delivered_count,opened_count,variant_a,variant_b,winning_variant")
      .order("scheduled_for", { ascending: false });
    if (error) {
      if (tableMissing(error, "notification_campaigns")) return { ok: true, campaigns: [] };
      throw error;
    }
    return { ok: true, campaigns: data || [] };
  });

  app.post("/notification-campaigns", async (request) => {
    const body = notificationCampaignSchema.parse(request.body || {});
    const { data, error } = await supabase
      .from("notification_campaigns")
      .insert({
        campaign_code: `NC-${Date.now()}`,
        campaign_name: body.name,
        trigger_event: body.trigger,
        segment: body.segment,
        scheduled_for: body.scheduledFor,
        audience_size: body.audienceSize ?? 0,
        variant_a: body.variantA ?? "",
        variant_b: body.variantB ?? "",
      })
      .select("id,campaign_name,trigger_event,segment,scheduled_for,status,audience_size,sent_count,delivered_count,opened_count,variant_a,variant_b,winning_variant")
      .single();
    if (error) {
      if (tableMissing(error, "notification_campaigns")) return { ok: true, campaign: null };
      throw error;
    }
    return { ok: true, campaign: data };
  });

  app.patch("/notification-campaigns/:id", async (request) => {
    const id = String((request.params as any).id || "").trim();
    const body = notificationCampaignSchema.parse(request.body || {});
    const { data, error } = await supabase
      .from("notification_campaigns")
      .update({
        status: body.status,
        sent_count: body.sentCount,
        delivered_count: body.deliveredCount,
        opened_count: body.openedCount,
        winning_variant: body.winner,
      })
      .eq("id", id)
      .select("id,campaign_name,trigger_event,segment,scheduled_for,status,audience_size,sent_count,delivered_count,opened_count,variant_a,variant_b,winning_variant")
      .single();
    if (error) {
      if (tableMissing(error, "notification_campaigns")) return { ok: true, campaign: null };
      throw error;
    }
    return { ok: true, campaign: data };
  });

  return app;
}

const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isDirectRun) {
  const app = createServer();
  app.listen({ host: "0.0.0.0", port: config.port }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}
