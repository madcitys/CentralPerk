import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import Fastify from "fastify";
import path from "path";
import { fileURLToPath } from "url";
import WebSocket from "ws";
import dotenv from "dotenv";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serviceDir, "../..");
dotenv.config({ path: path.resolve(serviceDir, ".env"), quiet: true });
dotenv.config({ path: path.resolve(repoRoot, ".env"), quiet: true });
dotenv.config({ quiet: true });
const localRewards = [
    {
        id: "PHARM-RWD-001",
        reward_id: "PHARM-RWD-001",
        reward_catalog_id: "PHARM-RWD-001",
        name: "Medicine Discount Voucher",
        description: "Voucher for qualified over-the-counter or wellness purchases.",
        pointsCost: 120,
        points_cost: 120,
        category: "voucher",
        image_url: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
        active: true,
        is_active: true,
    },
    {
        id: "PHARM-RWD-002",
        reward_id: "PHARM-RWD-002",
        reward_catalog_id: "PHARM-RWD-002",
        name: "Wellness Essentials Voucher",
        description: "Use your points for eligible wellness products.",
        pointsCost: 180,
        points_cost: 180,
        category: "wellness",
        image_url: "https://images.unsplash.com/photo-1509440159596-0249088772ff?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
        active: true,
        is_active: true,
    },
    {
        id: "PHARM-RWD-003",
        reward_id: "PHARM-RWD-003",
        reward_catalog_id: "PHARM-RWD-003",
        name: "Vitamins & Supplements Discount",
        description: "Savings on selected vitamins and supplement items.",
        pointsCost: 220,
        points_cost: 220,
        category: "supplements",
        image_url: "https://images.unsplash.com/photo-1514228742587-6b1558fcf93a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
        active: true,
        is_active: true,
    },
    {
        id: "PHARM-RWD-004",
        reward_id: "PHARM-RWD-004",
        reward_catalog_id: "PHARM-RWD-004",
        name: "Free Health Check Coupon",
        description: "Show the QR code to pharmacy staff for validation.",
        pointsCost: 300,
        points_cost: 300,
        category: "voucher",
        image_url: "https://images.unsplash.com/photo-1556740749-887f6717d7e4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
        active: true,
        is_active: true,
    },
    {
        id: "PHARM-RWD-005",
        reward_id: "PHARM-RWD-005",
        reward_catalog_id: "PHARM-RWD-005",
        name: "Pharmacy Partner Voucher",
        description: "Redeemable at eligible pharmacy partner branches.",
        pointsCost: 350,
        points_cost: 350,
        category: "voucher",
        partner_id: "PARTNER-001",
        partner_code: "P001",
        partner_name: "Pharmacy Rewards Partner",
        partner_conversion_rate: 10,
        cash_value: 350,
        image_url: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
        active: true,
        is_active: true,
    },
    {
        id: "PHARM-RWD-009",
        reward_id: "PHARM-RWD-009",
        reward_catalog_id: "PHARM-RWD-009",
        name: "OTC Medicine Points Bonus",
        description: "Reward voucher for selected over-the-counter purchases.",
        pointsCost: 200,
        points_cost: 200,
        category: "medicine",
        active_flash_sale_id: "FLASH-001",
        flash_sale_starts_at: "2026-01-01T00:00:00.000Z",
        flash_sale_ends_at: "2026-12-31T23:59:59.000Z",
        flash_sale_quantity_limit: 200,
        flash_sale_claimed_count: 24,
        flash_sale_banner: "Flash sale live now",
        flash_sale_countdown_label: "Ends soon",
        image_url: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
        active: true,
        is_active: true,
    },
];
const localCoupons = [];
let rewardsCache = null;
const CACHE_TTL_MS = 30_000;
const LIVE_MODE = String(process.env.LIVE_MODE || "").trim().toLowerCase() === "true";
const USE_SHARED_SUPABASE = LIVE_MODE && process.env.USE_SPLIT_SERVICE_DATABASES !== "true";
const SHARED_SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SHARED_SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "";
function config() {
    return {
        supabaseUrl: USE_SHARED_SUPABASE ? SHARED_SUPABASE_URL : process.env.REWARD_SUPABASE_URL || SHARED_SUPABASE_URL,
        supabaseKey: USE_SHARED_SUPABASE
            ? SHARED_SUPABASE_KEY
            : process.env.REWARD_SUPABASE_SERVICE_ROLE_KEY ||
                process.env.REWARD_SUPABASE_ANON_KEY ||
                SHARED_SUPABASE_KEY,
        rewardSchema: USE_SHARED_SUPABASE ? "public" : process.env.REWARD_DB_SCHEMA || "reward_service",
        pointsUrl: (process.env.POINTS_ENGINE_URL || "http://127.0.0.1:4001").replace(/\/+$/, ""),
    };
}
function createSupabaseClient() {
    const cfg = config();
    if (!cfg.supabaseUrl || !cfg.supabaseKey || cfg.supabaseUrl.startsWith("http://127.0.0.1"))
        return null;
    return createClient(cfg.supabaseUrl, cfg.supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        realtime: { transport: WebSocket },
    });
}
function normalizeReward(row) {
    const rewardId = String(row.reward_id ?? row.rewardCatalogId ?? row.reward_catalog_id ?? row.id ?? "");
    return {
        ...row,
        id: rewardId,
        reward_id: rewardId,
        reward_catalog_id: String(row.reward_catalog_id ?? rewardId),
        name: String(row.name ?? "Reward"),
        description: String(row.description ?? ""),
        pointsCost: Number(row.pointsCost ?? row.points_cost ?? 0),
        points_cost: Number(row.points_cost ?? row.pointsCost ?? 0),
        category: String(row.category ?? "voucher"),
        active: Boolean(row.active ?? row.is_active ?? true),
        is_active: Boolean(row.is_active ?? row.active ?? true),
    };
}
function isLegacyCafeReward(reward) {
    const haystack = `${reward.reward_id} ${reward.name} ${reward.description} ${String(reward.category || "")}`.toLowerCase();
    return (haystack.includes("coffee") ||
        haystack.includes("pastry") ||
        haystack.includes("latte") ||
        haystack.includes("beans") ||
        haystack.includes("tumbler") ||
        haystack.includes("grab") ||
        haystack.includes("shopee") ||
        haystack.includes("foodpanda") ||
        haystack.includes("central perk") ||
        haystack.includes("api test") ||
        haystack.includes("synthetic"));
}
function isDebugReward(reward) {
    const haystack = `${reward.reward_id} ${reward.name} ${reward.description} ${String(reward.category || "")}`.toLowerCase();
    return (String(reward.reward_id || "").toUpperCase().startsWith("RWTEST") ||
        haystack.includes("probe") ||
        haystack.includes("api test") ||
        haystack.includes("codex") ||
        haystack.includes("qa nodocker") ||
        haystack.includes("no-docker") ||
        haystack.includes("nodocker") ||
        haystack.includes("demo reward") ||
        haystack.includes(" qa ") ||
        haystack.startsWith("qa-") ||
        haystack.includes("updated live supabase write") ||
        haystack.includes("final live proof reward") ||
        haystack.includes("synthetic") ||
        /\btest\b/.test(haystack));
}
function filterLiveCatalog(rewards) {
    if (!LIVE_MODE)
        return rewards;
    const pharmacyRewards = rewards.filter((reward) => String(reward.reward_id || "").startsWith("PHARM-RWD-") && !isDebugReward(reward));
    if (pharmacyRewards.length > 0) {
        return pharmacyRewards;
    }
    return rewards.filter((reward) => !isLegacyCafeReward(reward) && !isDebugReward(reward));
}
function filterRewards(rewards, query) {
    const baseRewards = filterLiveCatalog(rewards);
    const category = String(query.category || "").trim().toLowerCase();
    const activeOnly = String(query.active || "true").trim().toLowerCase() !== "false";
    const partnerOnly = String(query.partnerOnly || "").trim().toLowerCase() === "true";
    const search = String(query.search || "").trim().toLowerCase();
    return baseRewards.filter((reward) => {
        if (activeOnly && !(reward.is_active ?? reward.active))
            return false;
        if (category && String(reward.category || "").trim().toLowerCase() !== category)
            return false;
        if (partnerOnly && !reward.partner_id)
            return false;
        if (search && !`${reward.name} ${reward.description}`.toLowerCase().includes(search))
            return false;
        return true;
    });
}
async function selectRewardsFrom(client, schema, table) {
    const scoped = schema === "public" ? client : client.schema(schema);
    return scoped.from(table).select("*").order("points_cost", { ascending: true });
}
async function loadRewards() {
    if (rewardsCache && Date.now() - rewardsCache.loadedAt < CACHE_TTL_MS)
        return rewardsCache.rewards;
    const client = createSupabaseClient();
    if (!client) {
        if (LIVE_MODE) {
            throw new Error("Reward service cannot reach Supabase in live mode.");
        }
        return localRewards;
    }
    const cfg = config();
    const attempts = [
        { schema: cfg.rewardSchema, table: "reward_catalog" },
        { schema: cfg.rewardSchema, table: "rewards_catalog" },
        { schema: "public", table: "rewards_catalog" },
    ];
    for (const attempt of attempts) {
        const { data, error } = await selectRewardsFrom(client, attempt.schema, attempt.table);
        if (!error && data) {
            const rewards = data.map(normalizeReward);
            rewardsCache = { loadedAt: Date.now(), rewards };
            if (rewards.length > 0)
                return rewards;
            if (LIVE_MODE)
                return rewards;
            return localRewards;
        }
    }
    if (LIVE_MODE) {
        throw new Error("Reward catalog query failed in live mode.");
    }
    return localRewards;
}
async function findReward(id) {
    const normalized = id.trim().toLowerCase();
    return (await loadRewards()).find((reward) => [reward.id, reward.reward_id, reward.reward_catalog_id]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase())
        .includes(normalized));
}
function generateCouponCode(reward) {
    const prefix = String(reward.reward_id || reward.id || "RWDS")
        .replace(/[^A-Za-z0-9]/g, "")
        .slice(0, 5)
        .toUpperCase()
        .padEnd(5, "X");
    return `${prefix}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}
function createCoupon(reward, memberIdentifier) {
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 30 * 86_400_000);
    const id = `CPN-${crypto.randomUUID()}`;
    const couponCode = generateCouponCode(reward);
    return {
        id,
        coupon_id: id,
        couponCode,
        coupon_code: couponCode,
        rewardId: reward.reward_id || reward.id,
        reward_id: reward.reward_id || reward.id,
        rewardName: reward.name,
        reward_name: reward.name,
        memberIdentifier,
        member_identifier: memberIdentifier,
        status: "issued",
        issuedAt: issuedAt.toISOString(),
        issued_at: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        expires_at: expiresAt.toISOString(),
    };
}
async function persistCoupon(coupon, reward) {
    localCoupons.unshift(coupon);
    if (localCoupons.length > 500)
        localCoupons.length = 500;
    const client = createSupabaseClient();
    if (!client) {
        if (LIVE_MODE) {
            throw new Error("Reward redemption storage is unavailable in live mode.");
        }
        return;
    }
    const payload = {
        coupon_id: coupon.coupon_id,
        coupon_code: coupon.coupon_code,
        reward_id: coupon.reward_id,
        reward_catalog_id: reward.reward_catalog_id || reward.reward_id || reward.id,
        reward_name: coupon.reward_name,
        member_identifier: coupon.member_identifier,
        status: coupon.status,
        issued_at: coupon.issued_at,
        expires_at: coupon.expires_at,
    };
    const cfg = config();
    const scoped = cfg.rewardSchema === "public" ? client : client.schema(cfg.rewardSchema);
    const { error } = await scoped.from("reward_coupons").insert(payload);
    if (error) {
        if (LIVE_MODE) {
            throw error;
        }
        console.warn("Reward coupon persisted locally only:", error.message);
    }
}
async function redeemPoints(input) {
    const response = await fetch(`${config().pointsUrl}/points/redeem`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": `reward-redeem-${crypto
                .createHash("sha256")
                .update(`${input.memberIdentifier}:${input.rewardCatalogId}:${Date.now()}`)
                .digest("hex")
                .slice(0, 18)}`,
        },
        body: JSON.stringify(input),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = typeof payload?.error === "string" ? payload.error : `Points service failed (${response.status}).`;
        const error = new Error(message);
        error.statusCode = response.status;
        error.code = payload?.code;
        throw error;
    }
    return payload.result ?? payload;
}
function canUseDemoRedemptionFallback(error) {
    const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
    const code = String(error?.code || "").toLowerCase();
    return (!LIVE_MODE &&
        (process.env.USE_LOCAL_LOYALTY_API === "true" ||
            process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true" ||
            code === "member_not_found" ||
            message.includes("member not found") ||
            message.includes("fetch failed") ||
            message.includes("upstream")));
}
export function createServer() {
    const app = Fastify({ logger: true });
    app.setErrorHandler((error, _request, reply) => {
        const statusCode = Number(error.statusCode || 500);
        const code = error.code;
        reply.code(statusCode >= 400 && statusCode < 600 ? statusCode : 500).send({
            ok: false,
            code,
            error: error.message || "Reward service error.",
        });
    });
    app.get("/health", async () => ({
        ok: true,
        service: "reward-service",
        schema: config().rewardSchema,
        dataSource: createSupabaseClient() ? "supabase" : "local",
    }));
    app.get("/rewards", async (request) => {
        const query = request.query;
        return {
            ok: true,
            rewards: filterRewards(await loadRewards(), query),
            filters: query,
            schema: config().rewardSchema,
        };
    });
    app.get("/rewards/:id", async (request, reply) => {
        const { id } = request.params;
        const reward = await findReward(id);
        if (!reward) {
            reply.code(404).send({ ok: false, error: "reward_not_found" });
            return;
        }
        return { ok: true, reward };
    });
    app.post("/rewards/redeem", async (request, reply) => {
        const body = (request.body || {});
        const rewardId = String(body.rewardCatalogId || body.rewardId || "").trim();
        const memberIdentifier = String(body.memberIdentifier || body.memberId || body.email || "").trim();
        const fallbackEmail = body.fallbackEmail || body.email ? String(body.fallbackEmail || body.email) : undefined;
        if (!rewardId) {
            reply.code(400).send({ ok: false, error: "rewardCatalogId is required." });
            return;
        }
        if (!memberIdentifier && !fallbackEmail) {
            reply.code(400).send({ ok: false, error: "memberIdentifier or fallbackEmail is required." });
            return;
        }
        const reward = await findReward(rewardId);
        if (!reward || reward.is_active === false || reward.active === false) {
            reply.code(404).send({ ok: false, error: "reward_not_available" });
            return;
        }
        const points = Math.max(1, Math.floor(Number(body.points || body.pointsCost || reward.pointsCost || reward.points_cost || 0)));
        const resolvedMember = memberIdentifier || String(fallbackEmail || "");
        const redemptionPayload = {
            memberIdentifier: resolvedMember,
            fallbackEmail,
            points,
            rewardCatalogId: reward.reward_catalog_id || reward.reward_id || reward.id,
            reason: String(body.reason || `${reward.name} redemption`),
            transactionType: String(body.transactionType || "REDEEM").toUpperCase() === "GIFT" ? "GIFT" : "REDEEM",
            promotionCampaignId: body.promotionCampaignId ? String(body.promotionCampaignId) : null,
        };
        const result = await redeemPoints(redemptionPayload).catch((error) => {
            const hasSubmittedBalance = Number(body.currentBalance || 0) >= points;
            const insufficientInDemo = String(error?.code || "").toUpperCase() === "INSUFFICIENT_POINTS" &&
                hasSubmittedBalance &&
                (process.env.USE_LOCAL_LOYALTY_API === "true" || process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true");
            if (!insufficientInDemo && !canUseDemoRedemptionFallback(error))
                throw error;
            request.log.warn({ err: error }, "Using local reward redemption fallback.");
            return {
                memberId: resolvedMember,
                newBalance: Math.max(0, Number(body.currentBalance || 0) - points),
                newTier: "Bronze",
                pointsDeducted: points,
                source: "reward-service-demo-fallback",
            };
        });
        const coupon = createCoupon(reward, resolvedMember);
        await persistCoupon(coupon, reward);
        return {
            ok: true,
            result,
            reward,
            coupon,
        };
    });
    app.get("/coupons", async (request) => {
        const query = request.query;
        const memberIdentifier = String(query.memberIdentifier || query.email || "").trim().toLowerCase();
        const status = String(query.status || "").trim().toLowerCase();
        return {
            ok: true,
            coupons: localCoupons
                .filter((coupon) => (memberIdentifier ? coupon.member_identifier.toLowerCase() === memberIdentifier : true))
                .filter((coupon) => (status ? coupon.status === status : true)),
        };
    });
    app.patch("/coupons/:id/redeem", async (request, reply) => {
        const { id } = request.params;
        const coupon = localCoupons.find((entry) => entry.id === id || entry.coupon_id === id || entry.coupon_code === id);
        if (!coupon) {
            reply.code(404).send({ ok: false, error: "coupon_not_found" });
            return;
        }
        coupon.status = "redeemed";
        return { ok: true, coupon };
    });
    return app;
}
function isEntrypoint() {
    return process.argv[1] ? path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]) : false;
}
if (isEntrypoint()) {
    const app = createServer();
    app
        .listen({ host: process.env.HOST || "0.0.0.0", port: Number(process.env.PORT || 4006) })
        .then((address) => app.log.info({ address }, "Reward service listening"))
        .catch((err) => {
        app.log.error(err);
        process.exit(1);
    });
}
