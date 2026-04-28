import { z } from "zod";
import {
  defaultCommunicationPreference,
  loadCommunicationPreference,
  saveCommunicationPreference,
} from "../app/lib/member-lifecycle";
import { DEFAULT_TIER_RULES, resolveTier } from "../app/lib/loyalty-engine";
import { createApiHandler } from "./route-utils";
import { HttpError } from "./http-error";
import { createServerSupabaseClient } from "./supabase-admin";
import { loadLocalMemberActivity } from "./local-points";
import {
  listLocalNotifications,
  loadLocalCommunicationPreference,
  saveLocalCommunicationPreference,
} from "./local-notifications";

const preferenceBoolean = z
  .preprocess((value) => {
    if (typeof value !== "string") return value;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    return value;
  }, z.boolean())
  .optional();

const preferencePatchSchema = z
  .object({
    sms: preferenceBoolean,
    email: preferenceBoolean,
    push: preferenceBoolean,
    promotionalOptIn: preferenceBoolean,
    frequency: z.enum(["daily", "weekly", "never"]).optional(),
  })
  .strict();

function queryValue(value: unknown) {
  const normalized = Array.isArray(value)
    ? String(value[0] || "").trim()
    : typeof value === "string"
      ? value.trim()
      : "";
  return normalized.includes("{{") || normalized.includes("}}") ? "" : normalized;
}

function requireMemberId(req: { query: Record<string, unknown> }) {
  const memberId = queryValue(req.query.id);
  if (!memberId) throw new HttpError(400, "Member ID is required.");
  return memberId;
}

type MemberActivityResponse = {
  balance: {
    member_id: string;
    points_balance: number;
    tier: string;
  };
  history: Array<Record<string, unknown>>;
  profile: Record<string, unknown>;
};
const memberActivityCache = new Map<string, { loadedAt: number; value: MemberActivityResponse }>();
const MEMBER_ACTIVITY_CACHE_MS = 15_000;

function useLocalRuntimeFirst() {
  return (
    process.env.USE_REMOTE_LOYALTY_API !== "true" &&
    (process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "true" || process.env.USE_LOCAL_LOYALTY_API === "true")
  );
}

function transactionReason(row: Record<string, unknown>) {
  return String(row.reason ?? row.description ?? "");
}

async function loadFastMemberActivity(memberId: string, fallbackEmail?: string): Promise<MemberActivityResponse> {
  const cacheKey = `${memberId}:${fallbackEmail || ""}`;
  if (useLocalRuntimeFirst()) {
    return loadLocalMemberActivity(memberId, fallbackEmail);
  }

  const cached = memberActivityCache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < MEMBER_ACTIVITY_CACHE_MS) return cached.value;

  const supabase = createServerSupabaseClient();
  let memberQuery = supabase
    .from("loyalty_members")
    .select("id,member_id,member_number,first_name,last_name,email,phone,birthdate,points_balance,tier,enrollment_date")
    .limit(1);

  if (fallbackEmail) {
    memberQuery = memberQuery.or(`member_number.eq.${memberId},email.ilike.${fallbackEmail}`);
  } else if (Number.isFinite(Number(memberId))) {
    memberQuery = memberQuery.or(`member_number.eq.${memberId},id.eq.${Number(memberId)}`);
  } else {
    memberQuery = memberQuery.eq("member_number", memberId);
  }

  const memberRes = await memberQuery.maybeSingle();
  if (memberRes.error) throw memberRes.error;
  if (!memberRes.data) throw new Error("Member not found in loyalty_members.");

  const memberPk = memberRes.data.id ?? memberRes.data.member_id;
  const txRes = await supabase
    .from("loyalty_transactions")
    .select("*")
    .eq("member_id", memberPk)
    .order("transaction_date", { ascending: false })
    .limit(200);
  if (txRes.error) throw txRes.error;

  const points = Number(memberRes.data.points_balance || 0);
  const value = {
    balance: {
      member_id: String(memberRes.data.member_number || memberId),
      points_balance: points,
      tier: resolveTier(points, DEFAULT_TIER_RULES),
    },
    history: (txRes.data || []).map((tx) => ({
      type: String(tx.transaction_type || ""),
      points: Number(tx.points || 0),
      date: String(tx.transaction_date || tx.created_at || new Date().toISOString()),
      expiry_date: tx.expiry_date ? String(tx.expiry_date) : null,
      reason: transactionReason(tx),
    })),
    profile: memberRes.data,
  };

  memberActivityCache.set(cacheKey, { loadedAt: Date.now(), value });
  return value;
}

async function lookupMemberPk(memberId: string, fallbackEmail?: string) {
  const supabase = createServerSupabaseClient();
  const byNumber = await supabase
    .from("loyalty_members")
    .select("id")
    .eq("member_number", memberId)
    .limit(1)
    .maybeSingle();
  if (byNumber.error) throw byNumber.error;
  if (byNumber.data?.id !== undefined) return Number(byNumber.data.id);

  if (Number.isFinite(Number(memberId))) {
    const byId = await supabase
      .from("loyalty_members")
      .select("id")
      .eq("id", Number(memberId))
      .limit(1)
      .maybeSingle();
    if (byId.error) throw byId.error;
    if (byId.data?.id !== undefined) return Number(byId.data.id);
  }

  if (fallbackEmail) {
    const byEmail = await supabase
      .from("loyalty_members")
      .select("id")
      .ilike("email", fallbackEmail)
      .limit(1)
      .maybeSingle();
    if (byEmail.error) throw byEmail.error;
    if (byEmail.data?.id !== undefined) return Number(byEmail.data.id);
  }

  return null;
}

export const memberPointsHandler = createApiHandler({
  route: "/api/members/:id/points",
  methods: ["GET"] as const,
  rateLimit: { limit: 60, windowMs: 60_000 },
  handler: async ({ req }) => {
    const memberId = requireMemberId(req);
    const fallbackEmail = queryValue(req.query.email) || undefined;
    const activity = await loadFastMemberActivity(memberId, fallbackEmail).catch(() =>
      loadLocalMemberActivity(memberId, fallbackEmail),
    );
    return {
      ok: true as const,
      memberId,
      points: activity.balance.points_balance,
      balance: activity.balance,
    };
  },
});

export const memberProfileHandler = createApiHandler({
  route: "/api/members/:id/profile",
  methods: ["GET"] as const,
  rateLimit: { limit: 60, windowMs: 60_000 },
  handler: async ({ req }) => {
    const memberId = requireMemberId(req);
    const fallbackEmail = queryValue(req.query.email) || undefined;
    if (useLocalRuntimeFirst()) {
      const activity = await loadLocalMemberActivity(memberId, fallbackEmail);
      return {
        ok: true as const,
        memberId,
        profile: activity.profile,
        source: "local_runtime",
      };
    }

    const supabase = createServerSupabaseClient();

    let query = supabase
      .from("loyalty_members")
      .select("id,member_id,member_number,first_name,last_name,email,phone,birthdate,points_balance,tier,enrollment_date")
      .limit(1);

    if (fallbackEmail) {
      query = query.or(`member_number.eq.${memberId},email.ilike.${fallbackEmail}`);
    } else if (Number.isFinite(Number(memberId))) {
      query = query.or(`member_number.eq.${memberId},id.eq.${Number(memberId)}`);
    } else {
      query = query.eq("member_number", memberId);
    }

    const { data, error } = await query.maybeSingle();
    if (error || !data) {
      const activity = await loadLocalMemberActivity(memberId, fallbackEmail);
      return {
        ok: true as const,
        memberId,
        profile: activity.profile,
      };
    }

    return {
      ok: true as const,
      memberId,
      profile: data,
    };
  },
});

export const memberPointsHistoryHandler = createApiHandler({
  route: "/api/members/:id/points-history",
  methods: ["GET"] as const,
  rateLimit: { limit: 60, windowMs: 60_000 },
  handler: async ({ req }) => {
    const memberId = requireMemberId(req);
    const fallbackEmail = queryValue(req.query.email) || undefined;
    const activity = await loadFastMemberActivity(memberId, fallbackEmail).catch(() =>
      loadLocalMemberActivity(memberId, fallbackEmail),
    );
    return {
      ok: true as const,
      memberId,
      history: activity.history.slice(0, 200),
    };
  },
});

export const memberTierHandler = createApiHandler({
  route: "/api/members/:id/tier",
  methods: ["GET"] as const,
  rateLimit: { limit: 60, windowMs: 60_000 },
  handler: async ({ req }) => {
    const memberId = requireMemberId(req);
    const fallbackEmail = queryValue(req.query.email) || undefined;
    const activity = await loadFastMemberActivity(memberId, fallbackEmail).catch(() =>
      loadLocalMemberActivity(memberId, fallbackEmail),
    );
    return {
      ok: true as const,
      memberId,
      tier: activity.balance.tier,
    };
  },
});

export const memberNotificationsHandler = createApiHandler({
  route: "/api/members/:id/notifications",
  methods: ["GET"] as const,
  rateLimit: { limit: 60, windowMs: 60_000 },
  handler: async ({ req }) => {
    const memberId = requireMemberId(req);
    const fallbackEmail = queryValue(req.query.email) || undefined;
    const limit = Math.min(100, Math.max(1, Number(queryValue(req.query.limit)) || 20));
    if (useLocalRuntimeFirst()) {
      return {
        ok: true as const,
        memberId,
        notifications: await listLocalNotifications({ memberId, limit }),
        source: "local_runtime",
      };
    }

    try {
      const memberPk = await lookupMemberPk(memberId, fallbackEmail);
      if (memberPk === null) throw new HttpError(404, "Member not found.");

      const supabase = createServerSupabaseClient();
      const { data, error } = await supabase
        .from("notification_outbox")
        .select("id,subject,message,created_at,status")
        .eq("member_id", memberPk)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;

      return {
        ok: true as const,
        memberId,
        notifications: (data || []).map((row) => ({
          id: String(row.id ?? ""),
          subject: String(row.subject ?? "Notification"),
          message: String(row.message ?? ""),
          createdAt: String(row.created_at ?? new Date().toISOString()),
          status: String(row.status ?? "pending"),
        })),
      };
    } catch {
      return {
        ok: true as const,
        memberId,
        notifications: await listLocalNotifications({ memberId, limit }),
        source: "local_runtime",
      };
    }
  },
});

export const memberPreferencesHandler = createApiHandler({
  route: "/api/members/:id/preferences",
  methods: ["PATCH"] as const,
  schema: preferencePatchSchema,
  rateLimit: { limit: 30, windowMs: 60_000 },
  resolveActor: (_body, req) => requireMemberId(req),
  summarize: (body, req) => ({
    memberId: queryValue(req.query.id),
    fields: Object.keys(body),
  }),
  handler: async ({ body, req }) => {
    const memberId = requireMemberId(req);
    const fallbackEmail = queryValue(req.query.email) || undefined;
    const current = useLocalRuntimeFirst()
      ? await loadLocalCommunicationPreference(memberId)
      : await loadCommunicationPreference(memberId, fallbackEmail).catch(() => defaultCommunicationPreference);
    const preference = {
      ...current,
      ...body,
    };
    if (useLocalRuntimeFirst()) {
      await saveLocalCommunicationPreference(memberId, preference);
    } else {
      await saveCommunicationPreference(memberId, preference, fallbackEmail).catch(() =>
        saveLocalCommunicationPreference(memberId, preference),
      );
    }
    return {
      ok: true as const,
      memberId,
      preference,
    };
  },
});
