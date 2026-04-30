import dotenv from "dotenv";
dotenv.config();

import Fastify from "fastify";
import path from "path";
import { fileURLToPath } from "url";

type LoyaltyMemberRow = {
  id?: string | number | null;
  member_id?: string | number | null;
  member_number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  birthdate?: string | null;
  points_balance?: number | null;
  tier?: string | null;
  enrollment_date?: string | null;
};

const localMembers: LoyaltyMemberRow[] = [
  {
    id: 1,
    member_id: 1,
    member_number: "LOCAL-001",
    first_name: "Demo",
    last_name: "Member",
    email: "demo@example.com",
    phone: "09171234567",
    birthdate: "1995-01-01",
    points_balance: 1250,
    tier: "Gold",
    enrollment_date: "2026-01-01T00:00:00.000Z",
  },
  {
    id: 2,
    member_id: 2,
    member_number: "LOCAL-002",
    first_name: "Sample",
    last_name: "Customer",
    email: "sample@example.com",
    phone: "09179876543",
    birthdate: "1998-05-12",
    points_balance: 420,
    tier: "Bronze",
    enrollment_date: "2026-02-01T00:00:00.000Z",
  },
];

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
    throw new Error("Missing Supabase configuration for member-service.");
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

function parseLimit(value: unknown, fallback = 200) {
  const limit = Number(value ?? fallback);
  if (!Number.isFinite(limit)) return fallback;
  return Math.min(2000, Math.max(1, Math.floor(limit)));
}

function matchesMember(row: LoyaltyMemberRow, email?: string, memberId?: string) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedMemberId = String(memberId || "").trim().toLowerCase();
  if (!normalizedEmail && !normalizedMemberId) return true;

  const memberValues = [
    row.id,
    row.member_id,
    row.member_number,
    row.email,
  ]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).trim().toLowerCase());

  if (normalizedEmail && memberValues.includes(normalizedEmail)) return true;
  if (normalizedMemberId && memberValues.includes(normalizedMemberId)) return true;
  return false;
}

function memberSelect() {
  return [
    "id",
    "member_id",
    "member_number",
    "first_name",
    "last_name",
    "email",
    "phone",
    "birthdate",
    "points_balance",
    "tier",
    "enrollment_date",
  ].join(",");
}

function mapMember(row: LoyaltyMemberRow) {
  const firstName = String(row.first_name || "").trim();
  const lastName = String(row.last_name || "").trim();
  const memberNumber = String(row.member_number || row.member_id || row.id || "");
  return {
    id: memberNumber,
    memberId: String(row.id ?? row.member_id ?? memberNumber),
    memberNumber,
    member_number: memberNumber,
    name: `${firstName} ${lastName}`.trim() || memberNumber,
    firstName,
    lastName,
    email: String(row.email || ""),
    phone: row.phone ? String(row.phone) : null,
    birthdate: row.birthdate ? String(row.birthdate) : null,
    tier: String(row.tier || "Bronze"),
    pointsBalance: Number(row.points_balance || 0),
    points_balance: Number(row.points_balance || 0),
    enrollmentDate: row.enrollment_date ? String(row.enrollment_date) : null,
    enrollment_date: row.enrollment_date ? String(row.enrollment_date) : null,
  };
}

function findLocalMember(id: string) {
  const normalized = id.trim().toLowerCase();
  return (
    localMembers.find((member) =>
      [
        member.id,
        member.member_id,
        member.member_number,
        member.email,
      ]
        .filter((value) => value !== undefined && value !== null)
        .some((value) => String(value).trim().toLowerCase() === normalized),
    ) || null
  );
}

async function findMember(id: string) {
  if (useLocalFallback()) return findLocalMember(id);

  const encodedId = encodeURIComponent(id);
  let rows = await supabaseRest<LoyaltyMemberRow[]>(
    `loyalty_members?select=${memberSelect()}&member_number=eq.${encodedId}&limit=1`,
  );
  if (rows[0]) return rows[0];

  if (Number.isFinite(Number(id))) {
    rows = await supabaseRest<LoyaltyMemberRow[]>(
      `loyalty_members?select=${memberSelect()}&id=eq.${encodeURIComponent(String(Number(id)))}&limit=1`,
    );
    if (rows[0]) return rows[0];
  }

  rows = await supabaseRest<LoyaltyMemberRow[]>(
    `loyalty_members?select=${memberSelect()}&email=ilike.${encodedId}&limit=1`,
  );
  return rows[0] || null;
}

export function createServer() {
  const app = Fastify({ logger: true });

  app.get("/health", async (_request, reply) => {
    if (useLocalFallback()) {
      return { ok: true, service: "member-service", dataSource: "local" };
    }

    const config = supabaseConfig();
    if (!config.url || !config.key) {
      return reply.code(503).send({ ok: false, service: "member-service", error: "missing_supabase_config" });
    }
    return { ok: true, service: "member-service", dataSource: "supabase" };
  });

  app.get("/members", async (request) => {
    const query = request.query as { limit?: string; email?: string; memberId?: string };
    const limit = parseLimit(query.limit);
    if (useLocalFallback()) {
      const filteredMembers = localMembers.filter((member) => matchesMember(member, query.email, query.memberId));
      return {
        ok: true,
        members: filteredMembers.slice(0, limit).map(mapMember),
        source: "local",
      };
    }

    const rows = await supabaseRest<LoyaltyMemberRow[]>(
      `loyalty_members?select=${memberSelect()}&order=enrollment_date.desc&limit=${limit}`,
    );
    const filteredRows = rows.filter((member) => matchesMember(member, query.email, query.memberId));
    return {
      ok: true,
      members: filteredRows.map(mapMember),
      source: "supabase",
    };
  });

  app.get("/members/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const member = await findMember(id);
    if (!member) {
      reply.code(404).send({ ok: false, error: "member_not_found" });
      return;
    }
    return { ok: true, member: mapMember(member), source: useLocalFallback() ? "local" : "supabase" };
  });

  return app;
}

function isEntrypoint() {
  return process.argv[1] ? path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]) : false;
}

if (isEntrypoint()) {
  const app = createServer();
  app
    .listen({ host: process.env.HOST || "0.0.0.0", port: Number(process.env.PORT || 4003) })
    .then((address) => app.log.info({ address }, "Member service listening"))
    .catch((err) => {
      app.log.error(err);
      process.exit(1);
    });
}
