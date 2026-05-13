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
const localSegments = [
    {
        id: "local-high-value",
        name: "High Value",
        description: "Development-only members with high point balances.",
        is_system: true,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
        id: "local-active",
        name: "Active",
        description: "Development-only members with recent activity.",
        is_system: true,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
    },
];
let localSegmentSequence = 1;
let previewMembersCache = null;
const PREVIEW_MEMBERS_CACHE_TTL_MS = 30_000;
const localMembers = [
    {
        id: 1,
        member_number: "LOCAL-001",
        first_name: "Local",
        last_name: "Member",
        email: "local.member@example.com",
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
        segmentUrl: USE_SHARED_SUPABASE
            ? SHARED_SUPABASE_URL
            : process.env.SEGMENT_SUPABASE_URL || SHARED_SUPABASE_URL,
        segmentSchema: USE_SHARED_SUPABASE ? "public" : process.env.SEGMENT_DB_SCHEMA || "public",
        memberSchema: USE_SHARED_SUPABASE ? "public" : process.env.MEMBER_DB_SCHEMA || "public",
        segmentKey: USE_SHARED_SUPABASE
            ? SHARED_SUPABASE_KEY
            : process.env.SEGMENT_SUPABASE_SERVICE_ROLE_KEY ||
                process.env.SEGMENT_SUPABASE_ANON_KEY ||
                SHARED_SUPABASE_KEY,
        memberUrl: USE_SHARED_SUPABASE
            ? SHARED_SUPABASE_URL
            : process.env.MEMBER_SUPABASE_URL || SHARED_SUPABASE_URL,
        memberKey: USE_SHARED_SUPABASE
            ? SHARED_SUPABASE_KEY
            : process.env.MEMBER_SUPABASE_SERVICE_ROLE_KEY ||
                process.env.MEMBER_SUPABASE_ANON_KEY ||
                SHARED_SUPABASE_KEY,
    };
}
function useLocalFallback() {
    if (LIVE_MODE) {
        return false;
    }
    const { segmentUrl, memberUrl } = supabaseConfig();
    return (process.env.USE_LOCAL_LOYALTY_API === "true" ||
        process.env.NEXT_PUBLIC_USE_LOCAL_LOYALTY_API === "true" ||
        !segmentUrl ||
        !memberUrl ||
        segmentUrl.startsWith("http://127.0.0.1") ||
        segmentUrl.startsWith("http://localhost") ||
        memberUrl.startsWith("http://127.0.0.1") ||
        memberUrl.startsWith("http://localhost"));
}
function requireSupabaseConfig() {
    const config = supabaseConfig();
    if (!config.segmentUrl || !config.segmentKey || !config.memberUrl || !config.memberKey) {
        throw new Error("Missing Supabase configuration for segment-service.");
    }
    return config;
}
async function supabaseRest(pathAndQuery, target = "segment", schema, method = "GET", body) {
    const config = requireSupabaseConfig();
    const url = target === "member" ? config.memberUrl : config.segmentUrl;
    const key = target === "member" ? config.memberKey : config.segmentKey;
    const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/${pathAndQuery.replace(/^\/+/, "")}`;
    const response = await fetch(endpoint, {
        method,
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            Accept: "application/json",
            "Accept-Profile": schema || (target === "member" ? config.memberSchema : config.segmentSchema),
            "Content-Profile": schema || (target === "member" ? config.memberSchema : config.segmentSchema),
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
function isMissingColumnError(error, column) {
    const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
    return (message.includes(`column loyalty_members.${column.toLowerCase()} does not exist`) ||
        message.includes(`could not find the '${column.toLowerCase()}' column`));
}
function daysSince(value) {
    if (!value)
        return Number.POSITIVE_INFINITY;
    const parsed = new Date(value).getTime();
    if (!Number.isFinite(parsed))
        return Number.POSITIVE_INFINITY;
    return Math.max(0, Math.floor((Date.now() - parsed) / 86_400_000));
}
function normalizedField(value) {
    return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
}
function matchesCondition(member, condition) {
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
    if (operator === "is above" || operator === "above")
        return points > threshold;
    if (operator === "is below" || operator === "below")
        return points < threshold;
    return points === threshold;
}
function mapMember(row) {
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
function isInternalAutomationMember(row) {
    const email = String(row.email || "").toLowerCase();
    const [localPart = "", domain = ""] = email.split("@");
    const memberNumber = String(row.member_number || "").toLowerCase();
    const name = `${String(row.first_name || "")} ${String(row.last_name || "")}`.trim().toLowerCase();
    const looksLikeAutomationEmail = domain === "example.com" && ["smoke", "contract", "automation"].some((token) => localPart.includes(token));
    return looksLikeAutomationEmail || memberNumber.includes("test-api") || name.includes("automation");
}
function isMissingSegmentsTableError(error) {
    const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
    return (message.includes("relation") && message.includes("member_segments") && message.includes("does not exist")) || message.includes("\"member_segments\"") || message.includes("pgrst");
}
function isMissingGenericSegmentsTableError(error) {
    const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
    return ((message.includes("relation") && message.includes("segments") && message.includes("does not exist")) ||
        message.includes("\"segments\"") ||
        message.includes("could not find the 'is_system' column"));
}
function sanitizeSegmentPayload(input) {
    return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
function currentSegments() {
    return localSegments.map((segment) => ({ ...segment }));
}
async function loadSegmentsFromSupabase() {
    try {
        return await supabaseRest("member_segments?select=id,name,description,is_system,created_at,updated_at&order=is_system.desc&order=name.asc");
    }
    catch (error) {
        if (!isMissingSegmentsTableError(error))
            throw error;
        const rows = await supabaseRest("segments?select=id,name,description,logic_mode,conditions,status,created_at,updated_at&order=updated_at.desc");
        return rows.map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            is_system: false,
            created_at: row.created_at,
            updated_at: row.updated_at,
            status: row.status,
            logic_mode: row.logic_mode,
            conditions: row.conditions,
        }));
    }
}
async function loadPreviewMembers() {
    if (useLocalFallback())
        return localMembers;
    if (previewMembersCache && Date.now() - previewMembersCache.loadedAt < PREVIEW_MEMBERS_CACHE_TTL_MS) {
        return previewMembersCache.rows;
    }
    try {
        const rows = await supabaseRest("loyalty_members?select=id,member_number,first_name,last_name,email,tier,points_balance,last_activity_at&limit=1000", "member", requireSupabaseConfig().memberSchema);
        const filteredRows = rows.filter((row) => !isInternalAutomationMember(row));
        previewMembersCache = { loadedAt: Date.now(), rows: filteredRows };
        return filteredRows;
    }
    catch (error) {
        if (!isMissingColumnError(error, "last_activity_at"))
            throw error;
        const rows = await supabaseRest("loyalty_members?select=id,member_number,first_name,last_name,email,tier,points_balance&limit=1000", "member", requireSupabaseConfig().memberSchema);
        const filteredRows = rows.filter((row) => !isInternalAutomationMember(row));
        previewMembersCache = { loadedAt: Date.now(), rows: filteredRows };
        return filteredRows;
    }
}
async function buildPreview(body) {
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
        if (!config.segmentUrl || !config.segmentKey || !config.memberUrl || !config.memberKey) {
            return reply.code(503).send({ ok: false, service: "segment-service", error: "missing_supabase_config" });
        }
        return { ok: true, service: "segment-service", dataSource: "supabase" };
    });
    app.get("/segments", async (_request, reply) => {
        if (useLocalFallback()) {
            return { ok: true, segments: currentSegments(), source: "local" };
        }
        try {
            const segments = await loadSegmentsFromSupabase();
            return { ok: true, segments, source: "supabase" };
        }
        catch (error) {
            if (isMissingSegmentsTableError(error) || isMissingGenericSegmentsTableError(error)) {
                return reply.code(503).send({
                    ok: false,
                    error: "segments_table_required",
                    message: "Segments require the public.member_segments table before live mode can expose segment management.",
                });
            }
            throw error;
        }
    });
    app.post("/segments", async (request, reply) => {
        const body = (request.body || {});
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
        const payload = {
            id: body.id || undefined,
            name,
            description: String(body.description || "").trim() || null,
            is_system: false,
            updated_at: new Date().toISOString(),
        };
        const path = body.id
            ? `member_segments?id=eq.${encodeURIComponent(String(body.id))}`
            : "member_segments";
        const method = body.id ? "PATCH" : "POST";
        try {
            let saved;
            try {
                saved = await supabaseRest(path, "segment", undefined, method, sanitizeSegmentPayload(body.id ? payload : { ...payload, created_at: payload.updated_at }));
            }
            catch (error) {
                if (!isMissingSegmentsTableError(error))
                    throw error;
                const genericPayload = {
                    id: body.id || undefined,
                    name,
                    description: String(body.description || "").trim() || "",
                    logic_mode: body.logicMode === "OR" ? "OR" : "AND",
                    conditions: Array.isArray(body.conditions) ? body.conditions : [],
                    status: "active",
                    updated_at: payload.updated_at,
                    ...(body.id ? {} : { created_at: payload.updated_at }),
                };
                const genericPath = body.id
                    ? `segments?id=eq.${encodeURIComponent(String(body.id))}`
                    : "segments";
                saved = await supabaseRest(genericPath, "segment", undefined, method, sanitizeSegmentPayload(genericPayload));
            }
            const segment = Array.isArray(saved) ? saved[0] : saved;
            return {
                ok: true,
                segment,
                preview: await buildPreview(body),
                source: "supabase",
            };
        }
        catch (error) {
            if (isMissingSegmentsTableError(error)) {
                reply.code(503).send({
                    ok: false,
                    error: "segments_table_required",
                    message: "Segments require the public.member_segments table before live mode can save changes.",
                });
                return;
            }
            throw error;
        }
    });
    app.post("/segments/preview", async (request) => {
        const body = (request.body || {});
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
