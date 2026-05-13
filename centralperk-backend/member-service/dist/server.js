import Fastify from "fastify";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serviceDir, "../..");
dotenv.config({ path: path.resolve(serviceDir, ".env"), quiet: true });
dotenv.config({ path: path.resolve(repoRoot, ".env"), quiet: true });
dotenv.config({ quiet: true });
const localMembers = [
    {
        id: 1,
        member_id: 1,
        member_number: "LOCAL-001",
        first_name: "Local",
        last_name: "Member",
        email: "local-member@example.test",
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
        first_name: "Local",
        last_name: "Customer",
        email: "local-customer@example.test",
        phone: "09179876543",
        birthdate: "1998-05-12",
        points_balance: 420,
        tier: "Bronze",
        enrollment_date: "2026-02-01T00:00:00.000Z",
    },
];
const LIVE_MODE = String(process.env.LIVE_MODE || process.env.NEXT_PUBLIC_LIVE_MODE || "")
    .trim()
    .toLowerCase() === "true";
const USE_SHARED_SUPABASE = LIVE_MODE && process.env.USE_SPLIT_SERVICE_DATABASES !== "true";
const SHARED_SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SHARED_SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    "";
function supabaseConfig() {
    return {
        url: USE_SHARED_SUPABASE ? SHARED_SUPABASE_URL : process.env.MEMBER_SUPABASE_URL || SHARED_SUPABASE_URL,
        schema: USE_SHARED_SUPABASE ? "public" : process.env.MEMBER_DB_SCHEMA || "member_service",
        key: USE_SHARED_SUPABASE
            ? SHARED_SUPABASE_KEY
            : process.env.MEMBER_SUPABASE_SERVICE_ROLE_KEY ||
                process.env.MEMBER_SUPABASE_ANON_KEY ||
                SHARED_SUPABASE_KEY,
    };
}
function useLocalFallback() {
    const { url } = supabaseConfig();
    if (LIVE_MODE)
        return false;
    return (process.env.USE_LOCAL_LOYALTY_API === "true" ||
        process.env.NEXT_PUBLIC_USE_LOCAL_LOYALTY_API === "true" ||
        url.startsWith("http://127.0.0.1") ||
        url.startsWith("http://localhost"));
}
function requireSupabaseConfig() {
    const config = supabaseConfig();
    if (!config.url || !config.key) {
        throw new Error("Missing Supabase configuration for member-service.");
    }
    return config;
}
async function supabaseRest(pathAndQuery, method = "GET", body) {
    const { url, key, schema } = requireSupabaseConfig();
    const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/${pathAndQuery.replace(/^\/+/, "")}`;
    const response = await fetch(endpoint, {
        method,
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            Accept: "application/json",
            "Accept-Profile": schema,
            "Content-Profile": schema,
            ...(body !== undefined ? { "Content-Type": "application/json", Prefer: "return=representation" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Supabase request failed (${response.status}).`);
    }
    return (await response.json());
}
function parseLimit(value, fallback = 200) {
    const limit = Number(value ?? fallback);
    if (!Number.isFinite(limit))
        return fallback;
    return Math.min(2000, Math.max(1, Math.floor(limit)));
}
function matchesMember(row, email, memberId) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedMemberId = String(memberId || "").trim().toLowerCase();
    if (!normalizedEmail && !normalizedMemberId)
        return true;
    const memberValues = [
        row.id,
        row.member_id,
        row.member_number,
        row.email,
    ]
        .filter((value) => value !== undefined && value !== null)
        .map((value) => String(value).trim().toLowerCase());
    if (normalizedEmail && memberValues.includes(normalizedEmail))
        return true;
    if (normalizedMemberId && memberValues.includes(normalizedMemberId))
        return true;
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
function mapMember(row) {
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
function isInternalAutomationMember(row) {
    const email = String(row.email || "").toLowerCase();
    const [localPart = "", domain = ""] = email.split("@");
    const memberNumber = String(row.member_number || "").toLowerCase();
    const name = `${String(row.first_name || "")} ${String(row.last_name || "")}`.trim().toLowerCase();
    const looksLikeAutomationEmail = domain === "example.com" && ["smoke", "contract", "automation"].some((token) => localPart.includes(token));
    return looksLikeAutomationEmail || memberNumber.includes("test-api") || name.includes("automation");
}
function findLocalMember(id) {
    const normalized = id.trim().toLowerCase();
    return (localMembers.find((member) => !isInternalAutomationMember(member) &&
        [
            member.id,
            member.member_id,
            member.member_number,
            member.email,
        ]
            .filter((value) => value !== undefined && value !== null)
            .some((value) => String(value).trim().toLowerCase() === normalized)) || null);
}
async function findMember(id) {
    if (useLocalFallback())
        return findLocalMember(id);
    const encodedId = encodeURIComponent(id);
    let rows = await supabaseRest(`loyalty_members?select=${memberSelect()}&member_number=eq.${encodedId}&limit=1`);
    if (rows[0] && !isInternalAutomationMember(rows[0]))
        return rows[0];
    if (Number.isFinite(Number(id))) {
        rows = await supabaseRest(`loyalty_members?select=${memberSelect()}&id=eq.${encodeURIComponent(String(Number(id)))}&limit=1`);
        if (rows[0] && !isInternalAutomationMember(rows[0]))
            return rows[0];
    }
    rows = await supabaseRest(`loyalty_members?select=${memberSelect()}&email=ilike.${encodedId}&limit=1`);
    return rows[0] && !isInternalAutomationMember(rows[0]) ? rows[0] : null;
}
async function findMembersByQuery(query, limit) {
    const email = String(query.email || "").trim();
    const memberId = String(query.memberId || "").trim();
    if (!email && !memberId)
        return null;
    if (email) {
        const rows = await supabaseRest(`loyalty_members?select=${memberSelect()}&email=ilike.${encodeURIComponent(email)}&limit=${limit}`);
        return rows.filter((member) => !isInternalAutomationMember(member));
    }
    const encodedMemberId = encodeURIComponent(memberId);
    let rows = await supabaseRest(`loyalty_members?select=${memberSelect()}&member_number=eq.${encodedMemberId}&limit=${limit}`);
    rows = rows.filter((member) => !isInternalAutomationMember(member));
    if (rows.length > 0)
        return rows;
    if (Number.isFinite(Number(memberId))) {
        rows = await supabaseRest(`loyalty_members?select=${memberSelect()}&id=eq.${encodeURIComponent(String(Number(memberId)))}&limit=${limit}`);
        rows = rows.filter((member) => !isInternalAutomationMember(member));
        if (rows.length > 0)
            return rows;
        rows = await supabaseRest(`loyalty_members?select=${memberSelect()}&member_id=eq.${encodeURIComponent(String(Number(memberId)))}&limit=${limit}`);
        return rows.filter((member) => !isInternalAutomationMember(member));
    }
    return [];
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
        const query = request.query;
        const limit = parseLimit(query.limit);
        if (useLocalFallback()) {
            const filteredMembers = localMembers.filter((member) => matchesMember(member, query.email, query.memberId));
            return {
                ok: true,
                members: filteredMembers.slice(0, limit).map(mapMember),
                source: "local",
            };
        }
        const directRows = await findMembersByQuery(query, limit);
        if (directRows) {
            return {
                ok: true,
                members: directRows.map(mapMember),
                source: "supabase",
            };
        }
        const rows = await supabaseRest(`loyalty_members?select=${memberSelect()}&order=enrollment_date.desc&order=id.desc&limit=${limit}`);
        const filteredRows = rows.filter((member) => !isInternalAutomationMember(member) && matchesMember(member, query.email, query.memberId));
        return {
            ok: true,
            members: filteredRows.map(mapMember),
            source: "supabase",
        };
    });
    app.get("/members/:id", async (request, reply) => {
        const { id } = request.params;
        const member = await findMember(id);
        if (!member) {
            reply.code(404).send({ ok: false, error: "member_not_found" });
            return;
        }
        return { ok: true, member: mapMember(member), source: useLocalFallback() ? "local" : "supabase" };
    });
    app.post("/members/sync", async (request, reply) => {
        const body = (request.body || {});
        const email = String(body.email || "").trim().toLowerCase();
        const memberNumber = String(body.memberNumber || body.member_number || "").trim();
        if (!email && !memberNumber) {
            reply.code(400);
            return { ok: false, error: "member_identity_required" };
        }
        const payload = {
            member_id: Number.isFinite(Number(body.memberId ?? body.member_id)) ? Number(body.memberId ?? body.member_id) : null,
            member_number: memberNumber || null,
            first_name: String(body.firstName || body.first_name || "").trim() || null,
            last_name: String(body.lastName || body.last_name || "").trim() || null,
            email: email || null,
            phone: String(body.phone || "").trim() || null,
            birthdate: String(body.birthdate || "").trim() || null,
            points_balance: Number.isFinite(Number(body.pointsBalance ?? body.points_balance)) ? Number(body.pointsBalance ?? body.points_balance) : 0,
            tier: String(body.tier || "Bronze").trim() || "Bronze",
            enrollment_date: String(body.enrollmentDate || body.enrollment_date || new Date().toISOString()).trim(),
        };
        if (useLocalFallback()) {
            const existingIndex = localMembers.findIndex((row) => (email && String(row.email || "").trim().toLowerCase() === email) ||
                (memberNumber && String(row.member_number || "").trim() === memberNumber));
            if (existingIndex >= 0) {
                localMembers[existingIndex] = { ...localMembers[existingIndex], ...payload };
                return { ok: true, member: mapMember(localMembers[existingIndex]), source: "local" };
            }
            const nextId = (Math.max(0, ...localMembers.map((row) => Number(row.id || 0))) || 0) + 1;
            const created = { id: nextId, member_id: payload.member_id ?? nextId, ...payload };
            localMembers.unshift(created);
            return { ok: true, member: mapMember(created), source: "local" };
        }
        const existingRows = await findMembersByQuery({ email, memberId: memberNumber }, 1);
        if (existingRows && existingRows[0]) {
            const existing = existingRows[0];
            const updatedRows = await supabaseRest(`loyalty_members?id=eq.${encodeURIComponent(String(existing.id ?? existing.member_id ?? ""))}`, "PATCH", payload);
            const updated = updatedRows?.[0] || { ...existing, ...payload };
            return { ok: true, member: mapMember(updated), source: "supabase" };
        }
        const insertedRows = await supabaseRest("loyalty_members", "POST", payload);
        const inserted = insertedRows?.[0] || payload;
        return { ok: true, member: mapMember(inserted), source: "supabase" };
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
