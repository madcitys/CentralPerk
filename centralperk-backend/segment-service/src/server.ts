import Fastify from "fastify";
import { pathToFileURL } from "node:url";
import { config } from "./config.js";
import { supabase } from "./supabase-client.js";

type AnyRecord = Record<string, any>;

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function toMemberPreview(row: AnyRecord) {
  const firstName = String(row.first_name ?? row.firstName ?? "").trim();
  const lastName = String(row.last_name ?? row.lastName ?? "").trim();
  const memberNumber = String(row.member_number ?? row.memberNumber ?? row.member_id ?? row.memberId ?? row.id ?? "");
  return {
    id: String(row.id ?? row.member_id ?? row.memberId ?? ""),
    memberNumber,
    fullName: `${firstName} ${lastName}`.trim() || memberNumber || "Member",
    email: String(row.email ?? ""),
    tier: String(row.tier ?? "Bronze"),
    pointsBalance: Math.max(0, Math.floor(Number(row.points_balance ?? row.pointsBalance ?? 0))),
    lastActivityAt: row.last_activity_at || row.lastActivityAt ? String(row.last_activity_at ?? row.lastActivityAt) : null,
  };
}

function matchesCondition(member: ReturnType<typeof toMemberPreview>, condition: AnyRecord) {
  const field = String(condition.field || "").toLowerCase();
  const operator = String(condition.operator || "").toLowerCase();
  const value = String(condition.value || "").trim();

  if (field === "tier") {
    const tier = member.tier.toLowerCase();
    const expected = value.toLowerCase();
    if (operator.includes("not")) return tier !== expected;
    return tier === expected;
  }

  if (field === "points balance") {
    const expected = Number(value);
    if (!Number.isFinite(expected)) return true;
    if (operator.includes("greater") || operator.includes(">")) return member.pointsBalance > expected;
    if (operator.includes("less") || operator.includes("<")) return member.pointsBalance < expected;
    return member.pointsBalance === expected;
  }

  if (field === "last activity") {
    if (!member.lastActivityAt) return false;
    const days = Number(value);
    if (!Number.isFinite(days)) return true;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const activityTime = new Date(member.lastActivityAt).getTime();
    if (!Number.isFinite(activityTime)) return false;
    if (operator.includes("within") || operator.includes("less")) return activityTime >= cutoff;
    if (operator.includes("before") || operator.includes("older") || operator.includes("greater")) return activityTime < cutoff;
  }

  return true;
}

function filterMembers(members: ReturnType<typeof toMemberPreview>[], body: AnyRecord) {
  const conditions = Array.isArray(body.conditions) ? body.conditions : [];
  if (conditions.length === 0) return members;
  const useOr = String(body.logicMode || "AND").toUpperCase() === "OR";
  return members.filter((member) => {
    const results = conditions.map((condition) => matchesCondition(member, condition));
    return useOr ? results.some(Boolean) : results.every(Boolean);
  });
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
    const { error } = await supabase.from("member_segments").select("id").limit(1);
    if (error) {
      reply.code(503).send({
        status: "error",
        service: config.serviceName,
        dbMode: config.dbMode,
        schema: config.schema,
        database: { connected: false, check: "member_segments" },
      });
      return;
    }

    return {
      status: "ok",
      service: config.serviceName,
      dbMode: config.dbMode,
      schema: config.schema,
      database: { connected: true, check: "member_segments" },
    };
  });

  app.get("/segments", async () => {
    const { data, error } = await supabase
      .from("member_segments")
      .select("id,name,description,is_system,created_at,updated_at")
      .order("is_system", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw error;
    return { ok: true, segments: data || [] };
  });

  app.post("/segments", async (request) => {
    const body = (request.body || {}) as AnyRecord;
    const name = stringValue(body.name);
    if (!name) return { ok: false, error: "segment_name_required" };

    const payload = {
      name,
      description: stringValue(body.description) || null,
      is_system: false,
      updated_at: new Date().toISOString(),
    };

    const query = body.id
      ? supabase
          .from("member_segments")
          .update(payload)
          .eq("id", String(body.id))
          .eq("is_system", false)
          .select("id,name,description,is_system,created_at,updated_at")
          .single()
      : supabase
          .from("member_segments")
          .insert(payload)
          .select("id,name,description,is_system,created_at,updated_at")
          .single();

    const { data, error } = await query;
    if (error) throw error;

    let preview = null;
    if (body.logicMode && Array.isArray(body.conditions) && body.conditions.length > 0) {
      const previewRows = await buildPreview(body);
      preview = previewRows;
      await replaceSegmentMembers(String(data.id), previewRows.members.map((member) => member.id));
    }

    return { ok: true, segment: data, preview };
  });

  app.patch("/segments/:id", async (request, reply) => {
    const segmentId = String((request.params as AnyRecord).id || "").trim();
    const body = (request.body || {}) as AnyRecord;
    const name = stringValue(body.name);
    if (!segmentId || !name) {
      reply.code(400).send({ ok: false, error: "segment_id_and_name_required" });
      return;
    }

    const { data, error } = await supabase
      .from("member_segments")
      .update({
        name,
        description: stringValue(body.description) || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", segmentId)
      .eq("is_system", false)
      .select("id,name,description,is_system,created_at,updated_at")
      .single();
    if (error) throw error;
    return { ok: true, segment: data };
  });

  app.delete("/segments/:id", async (request, reply) => {
    const segmentId = String((request.params as AnyRecord).id || "").trim();
    if (!segmentId) {
      reply.code(400).send({ ok: false, error: "segment_id_required" });
      return;
    }

    const lookup = await supabase.from("member_segments").select("id,is_system").eq("id", segmentId).maybeSingle();
    if (lookup.error) throw lookup.error;
    if (!lookup.data) {
      reply.code(404).send({ ok: false, error: "segment_not_found" });
      return;
    }
    if (lookup.data.is_system) {
      reply.code(400).send({ ok: false, error: "system_segment_cannot_be_deleted" });
      return;
    }

    const { error } = await supabase.from("member_segments").delete().eq("id", segmentId);
    if (error) throw error;
    return { ok: true };
  });

  app.get("/segments/assignments", async (request) => {
    const segmentId = stringValue((request.query as AnyRecord).segmentId);
    let query = supabase.from("member_segment_assignments").select("assigned_at,member_id,segment_id");
    if (segmentId) query = query.eq("segment_id", segmentId);
    const { data, error } = await query;
    if (error) throw error;

    const rows = (data || []) as AnyRecord[];
    const segmentIds = [...new Set(rows.map((row) => String(row.segment_id)).filter(Boolean))];
    const segmentMap = new Map<string, AnyRecord>();
    if (segmentIds.length > 0) {
      const segments = await supabase.from("member_segments").select("id,name,is_system").in("id", segmentIds);
      if (segments.error) throw segments.error;
      for (const segment of segments.data || []) segmentMap.set(String(segment.id), segment);
    }

    return {
      ok: true,
      assignments: rows.map((row) => ({
        ...row,
        member_segments: segmentMap.get(String(row.segment_id)) || null,
      })),
    };
  });

  app.post("/segments/assignments", async (request) => {
    const body = (request.body || {}) as AnyRecord;
    const segmentId = stringValue(body.segmentId);
    const memberIds = Array.isArray(body.memberIds) ? body.memberIds : [];
    if (!segmentId || memberIds.length === 0) return { ok: true, assigned: 0 };

    const rows = memberIds.map((memberId) => ({ member_id: Number(memberId), segment_id: segmentId }));
    const { error } = await supabase.from("member_segment_assignments").upsert(rows, { onConflict: "member_id,segment_id" });
    if (error) throw error;
    return { ok: true, assigned: rows.length };
  });

  app.delete("/segments/assignments", async (request) => {
    const body = (request.body || {}) as AnyRecord;
    const segmentId = stringValue(body.segmentId);
    const memberIds = Array.isArray(body.memberIds) ? body.memberIds.map((id) => Number(id)) : [];
    if (!segmentId || memberIds.length === 0) return { ok: true, removed: 0 };

    const { error } = await supabase
      .from("member_segment_assignments")
      .delete()
      .eq("segment_id", segmentId)
      .in("member_id", memberIds);
    if (error) throw error;
    return { ok: true, removed: memberIds.length };
  });

  async function buildPreview(body: AnyRecord) {
    try {
      const response = await fetch(`${config.memberServiceUrl.replace(/\/+$/, "")}/members?limit=5000`, {
        headers: { accept: "application/json" },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : `Member service failed (${response.status})`);

      const rows = Array.isArray(payload?.members) ? payload.members : [];
      const members = filterMembers(rows.map(toMemberPreview), body);
      return { count: members.length, members };
    } catch (error) {
      app.log.warn({ err: error }, "Segment preview member service unavailable");
      return { count: 0, members: [] as ReturnType<typeof toMemberPreview>[] };
    }
  }

  async function replaceSegmentMembers(segmentId: string, memberIds: string[]) {
    const existing = await supabase.from("member_segment_assignments").select("member_id").eq("segment_id", segmentId);
    if (existing.error) throw existing.error;
    const existingIds = (existing.data || []).map((row) => Number(row.member_id));
    if (existingIds.length > 0) {
      const remove = await supabase
        .from("member_segment_assignments")
        .delete()
        .eq("segment_id", segmentId)
        .in("member_id", existingIds);
      if (remove.error) throw remove.error;
    }
    if (memberIds.length > 0) {
      const rows = memberIds.map((memberId) => ({ member_id: Number(memberId), segment_id: segmentId }));
      const add = await supabase.from("member_segment_assignments").upsert(rows, { onConflict: "member_id,segment_id" });
      if (add.error) throw add.error;
    }
  }

  app.post("/segments/preview", async (request) => {
    const preview = await buildPreview((request.body || {}) as AnyRecord);
    return { ok: true, preview };
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
