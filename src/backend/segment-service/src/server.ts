import dotenv from "dotenv";
dotenv.config();

import Fastify from "fastify";
import path from "path";
import { fileURLToPath } from "url";

type SegmentRow = {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  is_system?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type MemberRow = {
  id?: string | number | null;
  member_number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  tier?: string | null;
  points_balance?: number | null;
  last_activity_at?: string | null;
};

const localSegments: SegmentRow[] = [
  {
    id: "local-high-value",
    name: "High Value",
    description: "Local demo members with high point balances.",
    is_system: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "local-active",
    name: "Active",
    description: "Local demo members with recent activity.",
    is_system: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
];
let localSegmentSequence = 1;

const localMembers: MemberRow[] = [
  {
    id: 1,
    member_number: "LOCAL-001",
    first_name: "Demo",
    last_name: "Member",
    email: "demo@example.com",
    tier: "Gold",
    points_balance: 1250,
    last_activity_at: "2026-04-01T00:00:00.000Z",
  },
  {
    id: 2,
    member_number: "LOCAL-002",
    first_name: "Sample",
    last_name: "Customer",
    email: "sample@example.com",
    tier: "Bronze",
    points_balance: 420,
    last_activity_at: "2026-03-15T00:00:00.000Z",
  },
];

type SegmentPreviewCondition = {
  field?: string;
  operator?: string;
  value?: string | number;
};

type SegmentPreviewBody = {
  logicMode?: "AND" | "OR";
  conditions?: SegmentPreviewCondition[];
};

function supabaseConfig() {
  return {
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    key:
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
      "",
  };
}

function useLocalFallback() {
  const { url } = supabaseConfig();
  return (
    process.env.USE_LOCAL_LOYALTY_API === "true" ||
    process.env.NEXT_PUBLIC_USE_LOCAL_LOYALTY_API === "true" ||
    url.startsWith("http://127.0.0.1") ||
    url.startsWith("http://localhost")
  );
}

function requireSupabaseConfig() {
  const config = supabaseConfig();
  if (!config.url || !config.key) {
    throw new Error("Missing Supabase configuration for segment-service.");
  }
  return config;
}

async function supabaseRest<T>(pathAndQuery: string): Promise<T> {
  const { url, key } = requireSupabaseConfig();
  const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/${pathAndQuery.replace(/^\/+/, "")}`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Supabase request failed (${response.status}).`);
  }
  return (await response.json()) as T;
}

function daysSince(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((Date.now() - parsed) / 86_400_000));
}

function normalizedField(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
}

function matchesCondition(member: MemberRow, condition: SegmentPreviewCondition) {
  const field = normalizedField(condition.field);
  const operator = String(condition.operator || "is").trim().toLowerCase();
  const value = String(condition.value ?? "").trim();

  if (field === "tier") {
    const tier = String(member.tier || "").trim().toLowerCase();
    return operator === "is not" ? tier !== value.toLowerCase() : tier === value.toLowerCase();
  }

  if (field === "last activity" || field === "last activity at") {
    const threshold = Math.max(0, Number(value) || 0);
    const inactiveDays = daysSince(member.last_activity_at);
    return operator === "is older than" ? inactiveDays > threshold : inactiveDays <= threshold;
  }

  const points = Math.max(0, Number(member.points_balance || 0));
  const threshold = Math.max(0, Number(value) || 0);
  if (operator === "is above" || operator === "above") return points > threshold;
  if (operator === "is below" || operator === "below") return points < threshold;
  return points === threshold;
}

function mapMember(row: MemberRow) {
  return {
    id: String(row.id ?? ""),
    memberId: String(row.id ?? ""),
    memberNumber: String(row.member_number || ""),
    fullName: `${String(row.first_name || "")} ${String(row.last_name || "")}`.trim() || "Member",
    email: String(row.email || ""),
    tier: String(row.tier || "Bronze"),
    pointsBalance: Number(row.points_balance || 0),
    lastActivityAt: row.last_activity_at ? String(row.last_activity_at) : null,
  };
}

function currentSegments() {
  return localSegments.map((segment) => ({ ...segment }));
}

async function loadPreviewMembers() {
  return useLocalFallback()
    ? localMembers
    : await supabaseRest<MemberRow[]>(
        "loyalty_members?select=id,member_number,first_name,last_name,email,tier,points_balance,last_activity_at&limit=1000",
      );
}

async function buildPreview(body: SegmentPreviewBody) {
  const logicMode = body.logicMode === "OR" ? "OR" : "AND";
  const conditions = Array.isArray(body.conditions) ? body.conditions : [];
  const rows = await loadPreviewMembers();
  const filtered = rows.filter((member) => {
    const results = conditions.map((condition) => matchesCondition(member, condition));
    return logicMode === "OR" ? results.some(Boolean) : results.every(Boolean);
  });
  const members = filtered.slice(0, 25).map(mapMember);
  return {
    count: filtered.length,
    memberIds: filtered.map((member) => String(member.id ?? "")),
    sampleMembers: members,
    members,
  };
}

export function createServer() {
  const app = Fastify({ logger: true });

  app.get("/health", async (_request, reply) => {
    if (useLocalFallback()) {
      return { ok: true, service: "segment-service", dataSource: "local" };
    }

    const config = supabaseConfig();
    if (!config.url || !config.key) {
      return reply.code(503).send({ ok: false, service: "segment-service", error: "missing_supabase_config" });
    }
    return { ok: true, service: "segment-service", dataSource: "supabase" };
  });

  app.get("/segments", async () => {
    if (useLocalFallback()) {
      return { ok: true, segments: currentSegments(), source: "local" };
    }

    const segments = await supabaseRest<SegmentRow[]>(
      "member_segments?select=id,name,description,is_system,created_at,updated_at&order=is_system.desc&order=name.asc",
    );
    return { ok: true, segments, source: "supabase" };
  });

  app.post("/segments", async (request) => {
    const body = (request.body || {}) as SegmentPreviewBody & {
      id?: string;
      name?: string;
      description?: string;
    };
    const name = String(body.name || "").trim();
    if (!name) {
      return {
        ok: false,
        error: "Segment name is required.",
      };
    }

    if (useLocalFallback()) {
      const now = new Date().toISOString();
      const existing = body.id ? localSegments.find((segment) => String(segment.id) === String(body.id)) : null;
      const segment = existing || {
        id: `local-custom-${String(localSegmentSequence++).padStart(3, "0")}`,
        created_at: now,
        is_system: false,
      };

      segment.name = name;
      segment.description = String(body.description || "").trim() || null;
      segment.updated_at = now;
      if (!existing) {
        localSegments.push(segment);
      }

      return {
        ok: true,
        segment,
        preview: await buildPreview(body),
        source: "local",
      };
    }

    return {
      ok: false,
      error: "Remote segment save is not configured for this service.",
    };
  });

  app.post("/segments/preview", async (request) => {
    const body = (request.body || {}) as SegmentPreviewBody;
    return {
      ok: true,
      preview: await buildPreview(body),
      source: useLocalFallback() ? "local" : "supabase",
    };
  });

  return app;
}

function isEntrypoint() {
  return process.argv[1] ? path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]) : false;
}

if (isEntrypoint()) {
  const app = createServer();
  app
    .listen({ host: process.env.HOST || "0.0.0.0", port: Number(process.env.PORT || 4004) })
    .then((address) => app.log.info({ address }, "Segment service listening"))
    .catch((err) => {
      app.log.error(err);
      process.exit(1);
    });
}
