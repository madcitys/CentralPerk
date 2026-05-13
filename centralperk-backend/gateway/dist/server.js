import Fastify from "fastify";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { checkRateLimit } from "./rate-limit.js";
function buildTarget(base, path) {
    return `${base.replace(/\/+$/, "")}${path}`;
}
function withQuery(reqUrl, nextPath) {
    const queryIndex = reqUrl.indexOf("?");
    return queryIndex >= 0 ? `${nextPath}${reqUrl.slice(queryIndex)}` : nextPath;
}
function stripApiPrefix(reqUrl) {
    const [pathOnly, query = ""] = reqUrl.split("?");
    const stripped = pathOnly.replace(/^\/api(?=\/|$)/, "") || "/";
    return query ? `${stripped}?${query}` : stripped;
}
function isCampaignWrite(url, method) {
    if (method === "GET")
        return false;
    return url.startsWith("/campaigns");
}
function hasAdmin(headers) {
    const role = String(headers["x-role"] || headers["x-user-role"] || "").toLowerCase();
    return role === config.adminRole || role === "manager" || role === "staff";
}
function isAdminWrite(url, method) {
    if (method === "GET" || method === "HEAD" || method === "OPTIONS")
        return false;
    const pathOnly = (url.split("?")[0] || "/").replace(/^\/api(?=\/|$)/, "") || "/";
    return (isCampaignWrite(pathOnly, method) ||
        pathOnly.startsWith("/segments") ||
        pathOnly.startsWith("/rewards") ||
        pathOnly.startsWith("/settings") ||
        pathOnly.startsWith("/engagement") ||
        pathOnly.startsWith("/communications") ||
        pathOnly.startsWith("/partners") ||
        pathOnly.startsWith("/api/admin") ||
        pathOnly.startsWith("/admin"));
}
const readCache = new Map();
function cacheTtlMs(url, method) {
    if (method !== "GET")
        return 0;
    const pathOnly = (url.split("?")[0] || "/").replace(/^\/api(?=\/|$)/, "") || "/";
    if (pathOnly === "/members" ||
        pathOnly === "/segments" ||
        pathOnly === "/tiers" ||
        pathOnly === "/tiers/rules" ||
        pathOnly === "/points/snapshot" ||
        pathOnly === "/rewards" ||
        pathOnly === "/campaigns" ||
        pathOnly === "/campaigns/active" ||
        pathOnly === "/campaigns/performance" ||
        pathOnly === "/analytics/program-health" ||
        pathOnly === "/analytics/communications" ||
        pathOnly === "/analytics/mobile-summary" ||
        pathOnly === "/engagement/summary" ||
        pathOnly === "/settings/admin") {
        return 120_000;
    }
    return 0;
}
function proxyCacheKey(method, targetBase, targetPath) {
    return `${method}:${targetBase.replace(/\/+$/, "")}:${targetPath}`;
}
function clearReadCacheForMutation(method, status) {
    if (method === "GET" || status >= 500)
        return;
    readCache.clear();
}
async function proxy(req, reply, targetBase) {
    return proxyWithPath(req, reply, targetBase, req.url);
}
async function proxyWithPath(req, reply, targetBase, targetPath) {
    const url = buildTarget(targetBase, targetPath);
    const method = req.method.toUpperCase();
    const ttlMs = cacheTtlMs(req.url, method);
    const cacheKey = ttlMs > 0 ? proxyCacheKey(method, targetBase, targetPath) : "";
    if (cacheKey) {
        const cached = readCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            cached.expiresAt = Date.now() + ttlMs;
            reply.status(cached.status);
            for (const [key, value] of Object.entries(cached.headers)) {
                reply.header(key, value);
            }
            reply.header("x-cache", "HIT");
            reply.send(Buffer.from(cached.body));
            return;
        }
        if (cached)
            readCache.delete(cacheKey);
    }
    let body;
    if (!["GET", "HEAD"].includes(method)) {
        if (req.body === undefined || req.body === null) {
            body = undefined;
        }
        else if (typeof req.body === "string" || Buffer.isBuffer(req.body)) {
            body = typeof req.body === "string"
                ? req.body
                : req.body.buffer.slice(req.body.byteOffset, req.body.byteOffset + req.body.byteLength);
        }
        else {
            body = JSON.stringify(req.body);
        }
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
        const normalizedKey = key.toLowerCase();
        if (["host", "content-length", "connection", "accept-encoding", "expect"].includes(normalizedKey))
            continue;
        if (Array.isArray(value)) {
            for (const entry of value)
                headers.append(key, String(entry));
        }
        else if (value !== undefined) {
            headers.set(key, String(value));
        }
    }
    try {
        const res = await fetch(url, {
            method,
            headers,
            body,
        });
        reply.status(res.status);
        const responseHeaders = {};
        res.headers.forEach((v, k) => {
            if (["content-encoding", "content-length", "transfer-encoding", "connection", "set-cookie"].includes(k.toLowerCase()))
                return;
            reply.header(k, v);
            responseHeaders[k] = v;
        });
        const ab = await res.arrayBuffer();
        const responseBody = Buffer.from(ab);
        if (cacheKey && res.status >= 200 && res.status < 300) {
            readCache.set(cacheKey, {
                status: res.status,
                headers: responseHeaders,
                body: responseBody,
                expiresAt: Date.now() + ttlMs,
            });
            reply.header("x-cache", "MISS");
        }
        clearReadCacheForMutation(method, res.status);
        reply.send(responseBody);
    }
    catch (error) {
        req.log.error({ err: error, target: targetBase, path: req.url }, "Gateway upstream request failed");
        reply.code(502).send({
            ok: false,
            error: "upstream_unavailable",
            upstream: targetBase,
            path: req.url,
        });
    }
}
export function createServer() {
    const app = Fastify({ logger: true });
    app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
        done(null, Object.fromEntries(new URLSearchParams(String(body || ""))));
    });
    app.addContentTypeParser("text/plain", { parseAs: "string" }, (_req, body, done) => {
        const text = String(body || "").trim();
        if (!text) {
            done(null, {});
            return;
        }
        try {
            done(null, JSON.parse(text));
        }
        catch {
            done(null, text);
        }
    });
    const pointsTarget = () => (config.useLocalRuntime ? config.nextApiUrl : config.pointsUrl);
    const campaignTarget = () => (config.useLocalRuntime ? config.nextApiUrl : config.campaignUrl);
    const memberTarget = () => (config.useLocalRuntime ? config.nextApiUrl : config.memberUrl);
    const segmentTarget = () => (config.useLocalRuntime ? config.nextApiUrl : config.segmentUrl);
    const rewardTarget = () => (config.useLocalRuntime ? config.nextApiUrl : config.rewardUrl);
    const notificationTarget = () => (config.useLocalRuntime ? config.nextApiUrl : config.notificationUrl);
    const backendApiTarget = () => config.backendApiUrl;
    const nextApiTarget = () => config.nextApiUrl;
    const proxyToNextApi = async (req, reply) => proxy(req, reply, nextApiTarget());
    const proxyToBackendApi = async (req, reply) => proxy(req, reply, backendApiTarget());
    const proxyToBackendApiFromApiPrefix = async (req, reply) => proxyWithPath(req, reply, backendApiTarget(), stripApiPrefix(req.url));
    const healthPayload = async () => ({
        success: true,
        ok: true,
        service: "centralperk-gateway",
        time: new Date().toISOString(),
        host: config.host,
        port: config.port,
        mode: config.useLocalRuntime ? "local_runtime" : "microservices",
        upstreams: {
            points: pointsTarget(),
            campaign: campaignTarget(),
            members: memberTarget(),
            segments: segmentTarget(),
            notifications: notificationTarget(),
            rewards: rewardTarget(),
            backendApi: backendApiTarget(),
            nextApi: config.nextApiUrl,
            pointsEngine: config.pointsUrl,
            campaignService: config.campaignUrl,
            memberService: config.memberUrl,
            segmentService: config.segmentUrl,
            notificationService: config.notificationUrl,
            rewardService: config.rewardUrl,
        },
    });
    app.get("/", async () => ({
        success: true,
        message: "CentralPerk gateway is running.",
        service: "centralperk-gateway",
        liveMode: true,
        apiBaseUrl: `http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}`,
        health: "/health",
        debug: {
            supabase: "/api/debug/supabase",
            liveDataStatus: "/api/debug/live-data-status",
            config: "/debug/config",
        },
    }));
    app.get("/health", healthPayload);
    app.post("/health", healthPayload);
    app.get("/debug/config", async () => ({
        ok: true,
        gateway: {
            port: config.port,
            host: config.host,
            environment: process.env.NODE_ENV || "development",
            mobileApiMode: "gateway_proxy",
        },
        enabledModules: [
            "auth",
            "members",
            "points",
            "rewards",
            "campaigns",
            "notifications",
            "analytics",
            "engagement",
            "settings",
            "admin-mobile",
            "customer-mobile",
        ],
        upstreams: {
            points: pointsTarget(),
            campaign: campaignTarget(),
            members: memberTarget(),
            segments: segmentTarget(),
            notifications: notificationTarget(),
            rewards: rewardTarget(),
            backendApi: backendApiTarget(),
            nextApi: config.nextApiUrl,
        },
    }));
    app.get("/debug/supabase", async (req, reply) => proxyWithPath(req, reply, backendApiTarget(), "/debug/supabase"));
    app.get("/debug/live-data-status", async (req, reply) => proxyWithPath(req, reply, backendApiTarget(), "/debug/live-data-status"));
    app.get("/points/health", async (req, reply) => proxyWithPath(req, reply, pointsTarget(), "/health"));
    app.get("/campaigns/health", async (req, reply) => proxyWithPath(req, reply, campaignTarget(), "/health"));
    app.get("/members/health", async (req, reply) => proxyWithPath(req, reply, memberTarget(), "/health"));
    app.get("/segments/health", async (req, reply) => proxyWithPath(req, reply, segmentTarget(), "/health"));
    app.get("/notifications/health", async (req, reply) => proxyWithPath(req, reply, notificationTarget(), "/health"));
    app.get("/rewards/health", async (req, reply) => proxyWithPath(req, reply, rewardTarget(), "/health"));
    app.all("/points/snapshot", proxyToBackendApi);
    app.all("/points/*", async (req, reply) => {
        if (req.url.startsWith("/points/award")) {
            const key = (req.ip || "global").toString();
            if (!checkRateLimit(key, 1000, 60_000)) {
                reply.code(429).send({ ok: false, error: "rate_limited" });
                return;
            }
        }
        return proxy(req, reply, pointsTarget());
    });
    app.addHook("preHandler", async (req, reply) => {
        if (!config.useLocalRuntime && isAdminWrite(req.url, req.method) && !hasAdmin(req.headers)) {
            reply.code(403).send({ ok: false, error: "forbidden" });
            return reply;
        }
    });
    app.all("/campaigns", async (req, reply) => proxy(req, reply, campaignTarget()));
    app.all("/campaigns/*", async (req, reply) => proxy(req, reply, campaignTarget()));
    app.get("/tiers", async (req, reply) => proxyWithPath(req, reply, pointsTarget(), withQuery(req.url, "/points/tiers")));
    app.get("/tiers/rules", async (req, reply) => proxyWithPath(req, reply, pointsTarget(), withQuery(req.url, "/points/tiers")));
    app.all("/segments", async (req, reply) => proxy(req, reply, segmentTarget()));
    app.all("/segments/*", async (req, reply) => proxy(req, reply, segmentTarget()));
    app.all("/members", async (req, reply) => proxy(req, reply, memberTarget()));
    app.all("/members/:id/points", proxyToBackendApi);
    app.all("/members/:id/points-history", proxyToBackendApi);
    app.all("/members/:id/tier", proxyToBackendApi);
    app.all("/members/:id/notifications", proxyToBackendApi);
    app.all("/members/:id/preferences", proxyToBackendApi);
    app.all("/members/:id/profile", proxyToBackendApi);
    app.all("/members/*", async (req, reply) => proxy(req, reply, memberTarget()));
    app.all("/notifications", async (req, reply) => proxy(req, reply, notificationTarget()));
    app.all("/notifications/:id/read", proxyToBackendApi);
    app.all("/notifications/*", async (req, reply) => proxy(req, reply, notificationTarget()));
    app.all("/communications/*", proxyToBackendApi);
    app.all("/analytics/*", proxyToBackendApi);
    app.all("/engagement/*", proxyToBackendApi);
    app.all("/settings/*", proxyToBackendApi);
    app.all("/auth/*", proxyToNextApi);
    app.all("/partners", proxyToBackendApi);
    app.all("/partners/*", proxyToBackendApi);
    app.all("/referrals", proxyToBackendApi);
    app.all("/referrals/*", proxyToBackendApi);
    app.all("/events/*", proxyToBackendApi);
    app.all("/unsubscribe", proxyToBackendApi);
    app.all("/rewards", async (req, reply) => proxy(req, reply, rewardTarget()));
    app.all("/rewards/*", async (req, reply) => proxy(req, reply, rewardTarget()));
    app.all("/api/*", proxyToBackendApiFromApiPrefix);
    return app;
}
async function warmCommonReads(app) {
    const paths = [
        "/members?limit=50",
        "/points/snapshot",
        "/campaigns",
        "/campaigns/active",
        "/segments",
        "/tiers/rules",
        "/rewards",
        "/analytics/program-health",
        "/analytics/mobile-summary",
        "/engagement/summary",
        "/settings/admin",
    ];
    await Promise.allSettled(paths.map((url) => app.inject({
        method: "GET",
        url,
        headers: { "x-cache-warm": "true" },
    })));
}
function isEntrypoint() {
    return process.argv[1] ? path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]) : false;
}
if (isEntrypoint()) {
    const app = createServer();
    app
        .listen({ host: config.host, port: config.port })
        .then((address) => {
        app.log.info({ address }, "Gateway listening");
        setTimeout(() => {
            warmCommonReads(app).catch((err) => app.log.warn({ err }, "Gateway cache warmup failed"));
        }, 750);
    })
        .catch((err) => {
        app.log.error(err);
        process.exit(1);
    });
}
