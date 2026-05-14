import Fastify from "fastify";
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

  app.get("/notifications", async () => {
    const { data, error } = await supabase.from("notification_outbox").select("*").limit(100);
    if (error) throw error;
    return { ok: true, notifications: data || [] };
  });

  app.post("/notifications", async (request) => {
    const body = notificationSchema.parse(request.body);
    const { data, error } = await supabase
      .from("notification_outbox")
      .insert({
        member_id: body.memberId ?? null,
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

  return app;
}

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === process.argv[1]) {
  const app = createServer();
  app.listen({ host: "0.0.0.0", port: config.port }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}
