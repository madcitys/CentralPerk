import Fastify from "fastify";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serviceDir, "../..");
dotenv.config({ path: path.resolve(serviceDir, ".env"), quiet: true });
dotenv.config({ path: path.resolve(repoRoot, ".env"), quiet: true });
dotenv.config({ quiet: true });
const notifications = [];
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
        url: USE_SHARED_SUPABASE
            ? SHARED_SUPABASE_URL
            : process.env.NOTIFICATION_SUPABASE_URL || SHARED_SUPABASE_URL,
        schema: USE_SHARED_SUPABASE ? "public" : process.env.NOTIFICATION_DB_SCHEMA || "notification_service",
        key: USE_SHARED_SUPABASE
            ? SHARED_SUPABASE_KEY
            : process.env.NOTIFICATION_SUPABASE_SERVICE_ROLE_KEY ||
                process.env.NOTIFICATION_SUPABASE_ANON_KEY ||
                SHARED_SUPABASE_KEY,
    };
}
function useLocalFallback() {
    const { url } = supabaseConfig();
    if (LIVE_MODE)
        return false;
    return (process.env.USE_LOCAL_LOYALTY_API === "true" ||
        process.env.NEXT_PUBLIC_USE_LOCAL_LOYALTY_API === "true" ||
        !url ||
        url.startsWith("http://127.0.0.1") ||
        url.startsWith("http://localhost"));
}
async function supabaseRest(pathAndQuery, method = "GET", body) {
    const { url, key, schema } = supabaseConfig();
    if (!url || !key) {
        throw new Error("Missing Supabase configuration for notification-service.");
    }
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
function parseLimit(value, fallback = 20) {
    const limit = Number(value ?? fallback);
    if (!Number.isFinite(limit))
        return fallback;
    return Math.min(100, Math.max(1, Math.floor(limit)));
}
function normalizeString(value) {
    const next = String(value ?? "").trim();
    return next || null;
}
function createNotification(input) {
    const subject = String(input.subject ?? "").trim() || "Loyalty update";
    const message = String(input.message ?? "").trim() || subject;
    const record = {
        id: `NOTIF-${crypto.randomUUID()}`,
        memberId: normalizeString(input.memberId),
        email: normalizeString(input.email)?.toLowerCase() ?? null,
        channel: input.channel,
        subject,
        message,
        status: "queued",
        createdAt: new Date().toISOString(),
        scheduledFor: normalizeString(input.scheduledFor),
        trigger: normalizeString(input.trigger),
    };
    notifications.unshift(record);
    if (notifications.length > 500)
        notifications.length = 500;
    return record;
}
function mapNotification(row) {
    return {
        id: String(row.id || `NOTIF-${crypto.randomUUID()}`),
        memberId: normalizeString(row.member_id ?? row.memberId),
        email: normalizeString(row.email)?.toLowerCase() ?? null,
        channel: String(row.channel || "push"),
        subject: String(row.subject || row.title || "Loyalty update"),
        message: String(row.message || ""),
        status: String(row.status || "queued"),
        createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
        scheduledFor: normalizeString(row.scheduled_for ?? row.scheduledFor),
        trigger: normalizeString(row.trigger),
    };
}
export function createServer() {
    const app = Fastify({ logger: true });
    app.get("/health", async () => ({
        ok: true,
        service: "notification-service",
        dataSource: useLocalFallback() ? "local" : "supabase",
    }));
    app.get("/notifications", async (request) => {
        const query = request.query;
        const memberId = normalizeString(query.memberId);
        const email = normalizeString(query.email)?.toLowerCase() ?? null;
        const channel = normalizeString(query.channel)?.toLowerCase() ?? null;
        if (useLocalFallback()) {
            return {
                ok: true,
                notifications: notifications
                    .filter((entry) => (memberId ? entry.memberId === memberId : true))
                    .filter((entry) => (email ? entry.email === email : true))
                    .filter((entry) => (channel ? entry.channel === channel : true))
                    .slice(0, parseLimit(query.limit))
                    .map((entry) => ({
                    ...entry,
                    title: entry.subject,
                })),
            };
        }
        const filters = [
            memberId ? `member_id=eq.${encodeURIComponent(memberId)}` : null,
            email ? `email=eq.${encodeURIComponent(email)}` : null,
            channel ? `channel=eq.${encodeURIComponent(channel)}` : null,
            `order=created_at.desc`,
            `limit=${parseLimit(query.limit)}`,
        ].filter(Boolean);
        try {
            const data = await supabaseRest(`notifications?${filters.join("&")}`);
            return {
                ok: true,
                notifications: (data || []).map((entry) => ({
                    ...mapNotification(entry),
                    title: String(entry.subject || "Loyalty update"),
                })),
            };
        }
        catch {
            return { ok: true, notifications: [] };
        }
    });
    async function enqueueNotification(body, channel) {
        const notification = createNotification({
            ...body,
            channel,
        });
        if (useLocalFallback()) {
            return notification;
        }
        const payload = {
            id: notification.id,
            member_id: notification.memberId,
            email: notification.email,
            channel: notification.channel,
            subject: notification.subject,
            message: notification.message,
            status: notification.status,
            created_at: notification.createdAt,
            scheduled_for: notification.scheduledFor ?? null,
            trigger: notification.trigger ?? null,
        };
        try {
            const data = await supabaseRest("notifications", "POST", payload);
            const saved = Array.isArray(data) ? data[0] : data;
            return saved ? mapNotification(saved) : notification;
        }
        catch {
            return notification;
        }
    }
    app.post("/notifications/sms", async (request) => {
        const body = (request.body || {});
        const notification = await enqueueNotification(body, "sms");
        return {
            ok: true,
            queued: 1,
            notification,
            result: { queued: true, channel: "sms" },
        };
    });
    app.post("/notifications/email", async (request) => {
        const body = (request.body || {});
        const notification = await enqueueNotification(body, "email");
        return {
            ok: true,
            queued: 1,
            notification,
            result: { queued: true, channel: "email" },
            scheduledFor: notification.scheduledFor ?? null,
        };
    });
    app.post("/notifications", async (request) => {
        const body = (request.body || {});
        const requestedChannel = String(body.channel || "push").trim().toLowerCase();
        const channel = requestedChannel === "email" || requestedChannel === "sms" ? requestedChannel : "push";
        const notification = await enqueueNotification(body, channel);
        return {
            ok: true,
            queued: 1,
            notification,
            result: { queued: true, channel },
        };
    });
    app.patch("/notifications/:id/read", async (request, reply) => {
        const params = request.params;
        if (useLocalFallback()) {
            const notification = notifications.find((entry) => entry.id === params.id);
            if (!notification) {
                reply.code(404);
                return { ok: false, error: "notification_not_found" };
            }
            notification.status = "read";
            return { ok: true, notification };
        }
        try {
            const data = await supabaseRest(`notifications?id=eq.${encodeURIComponent(String(params.id || ""))}`, "PATCH", { status: "read" });
            const saved = Array.isArray(data) ? data[0] : null;
            if (!saved) {
                reply.code(404);
                return { ok: false, error: "notification_not_found" };
            }
            return { ok: true, notification: mapNotification(saved) };
        }
        catch {
            reply.code(404);
            return { ok: false, error: "notification_not_found" };
        }
    });
    return app;
}
function isEntrypoint() {
    return process.argv[1] ? path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]) : false;
}
if (isEntrypoint()) {
    const app = createServer();
    app
        .listen({ host: process.env.HOST || "0.0.0.0", port: Number(process.env.PORT || 4005) })
        .then((address) => app.log.info({ address }, "Notification service listening"))
        .catch((err) => {
        app.log.error(err);
        process.exit(1);
    });
}
