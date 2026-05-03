import { z } from "zod";
import { createApiHandler } from "./route-utils";
import { HttpError } from "./http-error";
import { createServerSupabaseClient } from "./supabase-admin";
import { gatewayJson, useRemoteMicroservices } from "./microservice-client";

const createReferralSchema = z
  .object({
    referrerMemberId: z.string().trim().min(1).max(80),
    refereeEmail: z.string().trim().email().max(254),
    notify: z.boolean().optional(),
  })
  .strict();

type ReferralRow = Record<string, unknown>;

function nestedMemberNumber(value: unknown) {
  if (Array.isArray(value)) return value[0] && typeof value[0] === "object" ? String((value[0] as ReferralRow).member_number ?? "") : "";
  return value && typeof value === "object" ? String((value as ReferralRow).member_number ?? "") : "";
}

function normalizeReferralRow(row: ReferralRow, fallbackReferrerMemberId?: string) {
  return {
    id: String(row.id ?? crypto.randomUUID()),
    referrerMemberId:
      nestedMemberNumber(row.referrer) ||
      String(row.referrer_member_number ?? fallbackReferrerMemberId ?? row.referrer_member_id ?? ""),
    referrerCode: String(row.referrer_code ?? ""),
    refereeEmail: String(row.referee_email ?? ""),
    refereeMemberId: nestedMemberNumber(row.referee) || undefined,
    status: String(row.status || "pending") === "joined" ? "joined" : "pending",
    createdAt: String(row.created_at ?? new Date().toISOString()),
    convertedAt: row.converted_at ? String(row.converted_at) : undefined,
    bonusAwarded: Boolean(row.bonus_awarded),
  };
}

function buildReferralCode(memberNumber: string) {
  return `REF${memberNumber.replace(/\D/g, "").slice(-6).padStart(6, "0")}`;
}

async function lookupReferrer(memberId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("loyalty_members")
    .select("id,member_number,referral_code,first_name,last_name")
    .eq("member_number", memberId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new HttpError(404, "Referrer member was not found.");

  const memberNumber = String(data.member_number ?? memberId);
  const referralCode = String(data.referral_code ?? "").trim() || buildReferralCode(memberNumber);
  const name = `${String(data.first_name ?? "")} ${String(data.last_name ?? "")}`.trim() || memberNumber;

  return {
    id: Number(data.id),
    memberNumber,
    referralCode,
    name,
  };
}

async function findReferral(referrerMemberPk: number, refereeEmail: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("member_referrals")
    .select(
      "id,referrer_code,referee_email,status,created_at,converted_at,bonus_awarded,referrer_member_id,referee_member_id,referrer:referrer_member_id(member_number),referee:referee_member_id(member_number)",
    )
    .eq("referrer_member_id", referrerMemberPk)
    .ilike("referee_email", refereeEmail)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeReferralRow(data as ReferralRow) : null;
}

async function queueReferralInvite(input: {
  referrerName: string;
  referrerCode: string;
  refereeEmail: string;
}) {
  if (!useRemoteMicroservices()) return false;

  const subject = `${input.referrerName} invited you to Central Perk Rewards`;
  const message = [
    `Hi,`,
    ``,
    `${input.referrerName} invited you to join Central Perk Rewards.`,
    `Use referral code ${input.referrerCode} when you sign up.`,
    `You will earn welcome points after joining.`,
  ].join("\n");

  try {
    const response = await gatewayJson<{ queued?: number; result?: { queued?: boolean } }>("/notifications/email", {
      method: "POST",
      body: JSON.stringify({
        email: input.refereeEmail,
        subject,
        message,
        trigger: "referral_invite",
      }),
    });
    return Number(response.queued ?? (response.result?.queued ? 1 : 0)) > 0;
  } catch {
    return false;
  }
}

export const referralsHandler = createApiHandler<Record<string, unknown>>({
  route: "/api/referrals",
  methods: ["GET", "POST"] as const,
  parseBodyFromQuery: true,
  rateLimit: { limit: 30, windowMs: 60_000 },
  resolveActor: (body, req) =>
    (typeof body.referrerMemberId === "string" ? body.referrerMemberId : undefined) ||
    (typeof req.query.memberId === "string" ? req.query.memberId : undefined) ||
    "referrals",
  summarize: (body, req) => ({
    referrerMemberId: body.referrerMemberId || req.query.memberId || null,
    refereeEmail: body.refereeEmail || null,
  }),
  handler: async ({ body, req }) => {
    const supabase = createServerSupabaseClient();

    if (req.method?.toUpperCase() === "GET") {
      const memberId = typeof req.query.memberId === "string" ? req.query.memberId.trim() : "";
      if (!memberId) throw new HttpError(400, "memberId is required.");

      const referrer = await lookupReferrer(memberId);
      const { data, error } = await supabase
        .from("member_referrals")
        .select(
          "id,referrer_code,referee_email,status,created_at,converted_at,bonus_awarded,referrer_member_id,referee_member_id,referrer:referrer_member_id(member_number),referee:referee_member_id(member_number)",
        )
        .eq("referrer_member_id", referrer.id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      return {
        ok: true as const,
        referrals: (data || []).map((row) => normalizeReferralRow(row as ReferralRow, referrer.memberNumber)),
      };
    }

    const parsed = createReferralSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, "Invalid referral payload.");
    const input = parsed.data;
    const referrer = await lookupReferrer(input.referrerMemberId);
    const refereeEmail = input.refereeEmail.trim().toLowerCase();

    const existing = await findReferral(referrer.id, refereeEmail);
    if (existing) {
      return {
        ok: true as const,
        referral: existing,
        replayed: true,
        notificationQueued:
          input.notify === false
            ? false
            : await queueReferralInvite({
                referrerName: referrer.name,
                referrerCode: referrer.referralCode,
                refereeEmail,
              }),
      };
    }

    const result = await supabase.rpc("loyalty_create_referral_invite", {
      p_referrer_member_number: referrer.memberNumber,
      p_referee_email: refereeEmail,
    });

    if (result.error) throw result.error;

    return {
      ok: true as const,
      referral: normalizeReferralRow(result.data as ReferralRow, referrer.memberNumber),
      replayed: false,
      notificationQueued:
        input.notify === false
          ? false
          : await queueReferralInvite({
              referrerName: referrer.name,
              referrerCode: referrer.referralCode,
              refereeEmail,
            }),
    };
  },
});
