import { z } from "zod";
import { createApiHandler } from "../../../server/route-utils";
import { HttpError } from "../../../server/http-error";
import {
  createServerPublicSupabaseClient,
  createServerSupabaseClient,
} from "../../../server/supabase-admin";

const repairSchema = z.object({
  email: z.string().trim().email().max(254),
  reason: z.enum(["login", "register"]).optional(),
});

function appBaseUrl() {
  return (
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

export default createApiHandler({
  route: "/api/auth/repair-customer-access",
  methods: ["POST"] as const,
  schema: repairSchema,
  rateLimit: { limit: 10, windowMs: 60_000 },
  resolveActor: (body) => body.email.toLowerCase(),
  summarize: (body) => ({ email: body.email.toLowerCase(), reason: body.reason ?? "unknown" }),
  handler: async ({ body }) => {
    const normalizedEmail = body.email.trim().toLowerCase();
    const adminClient = createServerSupabaseClient();
    const publicClient = createServerPublicSupabaseClient();

    const { data: memberProfile, error: memberError } = await adminClient
      .from("loyalty_members")
      .select("id,member_number,email,first_name,last_name")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (memberError) throw memberError;
    if (!memberProfile) {
      throw new HttpError(404, "No loyalty profile found for that email.");
    }

    const { data: usersData, error: usersError } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (usersError) throw usersError;

    const authUser = (usersData.users || []).find(
      (user) => String(user.email || "").trim().toLowerCase() === normalizedEmail,
    );

    const redirectTo = `${appBaseUrl()}/login`;

    if (!authUser) {
      const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
        normalizedEmail,
        {
          data: {
            first_name: memberProfile.first_name ?? "",
            last_name: memberProfile.last_name ?? "",
            member_number: memberProfile.member_number ?? "",
          },
          redirectTo,
        },
      );

      if (inviteError) throw inviteError;

      return {
        ok: true,
        action: "invite_sent",
        message:
          "We found your loyalty profile and created your sign-in account. Check your email for the account setup link, then try signing in again.",
      };
    }

    if (!authUser.email_confirmed_at) {
      const { error: resendError } = await publicClient.auth.resend({
        type: "signup",
        email: normalizedEmail,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (resendError) throw resendError;

      return {
        ok: true,
        action: "confirmation_sent",
        message:
          "Your sign-in account exists but still needs email confirmation. We sent a fresh confirmation email. Check your inbox, spam, or promotions tab.",
      };
    }

    const { error: resetError } = await publicClient.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo,
    });

    if (resetError) throw resetError;

    return {
      ok: true,
      action: "reset_sent",
      message:
        "Your sign-in account exists. We sent a password reset email so you can finish account access and sign in again.",
    };
  },
});
