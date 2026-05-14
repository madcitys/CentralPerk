import Fastify from "fastify";
import { z } from "zod";
import { config } from "./config.js";
import { supabase } from "./supabase-client.js";

const resolveQuerySchema = z.object({
  identifier: z.string().trim().min(1).max(120),
  fallbackEmail: z.string().trim().email().optional(),
});

const balanceSchema = z.object({
  pointsBalance: z.number().int().min(0).max(1_000_000_000),
  tier: z.string().trim().min(1).max(80),
});

function memberSelect() {
  return "id,member_id,member_number,first_name,last_name,email,points_balance,tier";
}

function mapMember(row: any) {
  return {
    id: Number(row.id ?? row.member_id),
    memberId: Number(row.member_id ?? row.id),
    memberNumber: String(row.member_number ?? row.member_id ?? row.id ?? ""),
    member_number: String(row.member_number ?? row.member_id ?? row.id ?? ""),
    email: row.email ? String(row.email) : null,
    firstName: row.first_name ? String(row.first_name) : null,
    lastName: row.last_name ? String(row.last_name) : null,
    pointsBalance: Math.max(0, Math.floor(Number(row.points_balance ?? 0))),
    points_balance: Math.max(0, Math.floor(Number(row.points_balance ?? 0))),
    tier: String(row.tier || "Bronze"),
  };
}

async function findMember(identifier: string, fallbackEmail?: string) {
  const trimmed = identifier.trim();
  const columns = memberSelect();

  const byNumber = await supabase
    .from("loyalty_members")
    .select(columns)
    .eq("member_number", trimmed)
    .limit(1)
    .maybeSingle();
  if (byNumber.error) throw byNumber.error;
  if (byNumber.data) return byNumber.data;

  if (Number.isFinite(Number(trimmed))) {
    const byId = await supabase.from("loyalty_members").select(columns).eq("id", Number(trimmed)).limit(1).maybeSingle();
    if (byId.error) throw byId.error;
    if (byId.data) return byId.data;
  }

  const email = fallbackEmail || trimmed;
  const byEmail = await supabase.from("loyalty_members").select(columns).ilike("email", email).limit(1).maybeSingle();
  if (byEmail.error) throw byEmail.error;
  return byEmail.data;
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
    const { error } = await supabase.from("loyalty_members").select("id").limit(1);
    if (error) {
      reply.code(503).send({
        status: "error",
        service: config.serviceName,
        dbMode: config.dbMode,
        schema: config.schema,
        database: { connected: false, check: "loyalty_members" },
      });
      return;
    }

    return {
      status: "ok",
      service: config.serviceName,
      dbMode: config.dbMode,
      schema: config.schema,
      database: { connected: true, check: "loyalty_members" },
    };
  });

  app.get("/members/resolve", async (request, reply) => {
    const query = resolveQuerySchema.parse(request.query);
    const member = await findMember(query.identifier, query.fallbackEmail);
    if (!member) {
      reply.code(404).send({ ok: false, error: "member_not_found" });
      return;
    }
    return { ok: true, member: mapMember(member) };
  });

  app.get("/members/:id", async (request, reply) => {
    const id = String((request.params as any).id || "").trim();
    const member = await findMember(id);
    if (!member) {
      reply.code(404).send({ ok: false, error: "member_not_found" });
      return;
    }
    return { ok: true, member: mapMember(member) };
  });

  app.patch("/members/:id/points-balance", async (request, reply) => {
    const id = String((request.params as any).id || "").trim();
    const body = balanceSchema.parse(request.body);
    const { error } = await supabase
      .from("loyalty_members")
      .update({ points_balance: body.pointsBalance, tier: body.tier })
      .eq("id", Number(id));
    if (error) throw error;
    reply.code(204).send();
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
