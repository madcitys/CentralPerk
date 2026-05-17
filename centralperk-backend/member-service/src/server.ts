import Fastify from "fastify";
import { pathToFileURL } from "node:url";
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

const socialShareSchema = z.object({
  memberIdentifier: z.string().trim().min(1).max(120),
  referralCode: z.string().trim().max(120).optional(),
  channel: z.string().trim().min(1).max(40),
  achievement: z.string().trim().min(1).max(240),
  tier: z.string().trim().max(80).optional(),
  badgeLabel: z.string().trim().max(120).optional(),
  shareText: z.string().trim().max(500).optional(),
  destinationUrl: z.string().trim().max(1000).optional(),
});

function tableMissing(error: unknown, table: string) {
  const message = String((error as { message?: unknown; details?: unknown; hint?: unknown })?.message ?? "").toLowerCase();
  return message.includes(table.toLowerCase()) && (message.includes("does not exist") || message.includes("schema cache"));
}

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
    lastActivityAt: row.last_activity_at ? String(row.last_activity_at) : null,
    last_activity_at: row.last_activity_at ? String(row.last_activity_at) : null,
  };
}

function mapShareEvent(row: any, member?: any) {
  const fullName = `${String(member?.first_name ?? "").trim()} ${String(member?.last_name ?? "").trim()}`.trim();
  return {
    id: String(row.id ?? ""),
    memberId: String(member?.member_number ?? member?.member_id ?? row.member_id ?? ""),
    memberName: fullName || String(member?.member_number ?? row.member_id ?? "Member"),
    tier: String(row.tier_at_share ?? member?.tier ?? "Bronze"),
    channel: String(row.channel ?? "facebook"),
    achievement: String(row.achievement ?? "Shared achievement"),
    referralCode: String(row.referral_code ?? ""),
    conversions: Math.max(0, Number(row.conversion_count ?? 0)),
    createdAt: String(row.created_at ?? new Date().toISOString()),
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

  app.get("/members", async (request) => {
    const query = request.query as Record<string, any>;
    const limit = Math.min(5000, Math.max(1, Math.floor(Number(query.limit) || 5000)));
    const { data, error } = await supabase
      .from("loyalty_members")
      .select(memberSelect())
      .order("id", { ascending: true })
      .limit(limit);
    if (error) throw error;
    return { ok: true, members: (data || []).map(mapMember) };
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

  app.get("/social-share-events", async (request) => {
    const query = request.query as Record<string, any>;
    let memberId: number | null = null;

    if (query.memberIdentifier) {
      const member = (await findMember(String(query.memberIdentifier))) as any;
      if (!member) return { ok: true, events: [] };
      memberId = Number(member.id ?? member.member_id);
    }

    let builder = supabase
      .from("social_share_events")
      .select("id,member_id,referral_id,referral_code,channel,achievement,tier_at_share,badge_label,share_text,destination_url,conversion_count,last_converted_at,created_at")
      .order("created_at", { ascending: false });
    if (memberId !== null) builder = builder.eq("member_id", memberId);

    const { data, error } = await builder;
    if (error) {
      if (tableMissing(error, "social_share_events")) return { ok: true, events: [] };
      throw error;
    }

    const rows = data || [];
    const memberIds = [...new Set(rows.map((row: any) => Number(row.member_id)).filter(Number.isFinite))];
    const memberMap = new Map<string, any>();
    if (memberIds.length > 0) {
      const members = await supabase
        .from("loyalty_members")
        .select("id,member_id,member_number,first_name,last_name,tier")
        .in("id", memberIds);
      if (members.error) throw members.error;
      for (const member of members.data || []) memberMap.set(String(member.id), member);
    }

    return { ok: true, events: rows.map((row: any) => mapShareEvent(row, memberMap.get(String(row.member_id)))) };
  });

  app.post("/social-share-events", async (request) => {
    const body = socialShareSchema.parse(request.body || {});
    const member = (await findMember(body.memberIdentifier)) as any;
    if (!member) return { ok: false, error: "member_not_found" };

    const { data, error } = await supabase
      .from("social_share_events")
      .insert({
        member_id: Number(member.id ?? member.member_id),
        referral_code: body.referralCode || null,
        channel: body.channel,
        achievement: body.achievement,
        tier_at_share: body.tier || member.tier || null,
        badge_label: body.badgeLabel || null,
        share_text: body.shareText || null,
        destination_url: body.destinationUrl || null,
      })
      .select("id,member_id,referral_code,channel,achievement,tier_at_share,conversion_count,created_at")
      .single();
    if (error) {
      if (tableMissing(error, "social_share_events")) return { ok: true, event: null };
      throw error;
    }
    return { ok: true, event: mapShareEvent(data, member) };
  });

  app.post("/social-share-events/:id/conversion", async (request, reply) => {
    const id = String((request.params as any).id || "").trim();
    if (!id) {
      reply.code(400).send({ ok: false, error: "share_event_id_required" });
      return;
    }

    const existing = await supabase.from("social_share_events").select("conversion_count").eq("id", Number(id)).maybeSingle();
    if (existing.error) {
      if (tableMissing(existing.error, "social_share_events")) return { ok: true, event: null };
      throw existing.error;
    }
    if (!existing.data) return { ok: true, event: null };

    const nextCount = Math.max(0, Number(existing.data.conversion_count || 0)) + 1;
    const { data, error } = await supabase
      .from("social_share_events")
      .update({ conversion_count: nextCount, last_converted_at: new Date().toISOString() })
      .eq("id", Number(id))
      .select("id,member_id,referral_code,channel,achievement,tier_at_share,conversion_count,created_at")
      .single();
    if (error) throw error;
    return { ok: true, event: mapShareEvent(data) };
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
