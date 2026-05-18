import { createClient } from "@supabase/supabase-js";
import { publicAnonKey, supabaseUrl } from "../../utils/supabase/info";

function baseClientOptions() {
  return {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  } as const;
}

export function createServiceServerSupabaseClient(serviceUrl: string, serviceRoleKey: string, label: string) {
  const normalizedUrl = serviceUrl.trim();
  const normalizedKey = serviceRoleKey.trim();

  if (!normalizedUrl || !normalizedKey) {
    throw new Error(`Missing ${label} Supabase server configuration.`);
  }

  return createClient(normalizedUrl, normalizedKey, baseClientOptions());
}

export function createServerSupabaseClient() {
  const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

  if (!supabaseUrl || !serverKey) {
    throw new Error(
      "Missing server Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the project .env or .env.local."
    );
  }

  return createServiceServerSupabaseClient(supabaseUrl, serverKey, "default");
}

export function createServerPublicSupabaseClient() {
  if (!supabaseUrl || !publicAnonKey) {
    throw new Error(
      "Missing public Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in the project .env or .env.local."
    );
  }

  return createClient(supabaseUrl, publicAnonKey, baseClientOptions());
}

export function createMemberServerSupabaseClient() {
  return createServiceServerSupabaseClient(
    process.env.MEMBER_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || "",
    process.env.MEMBER_SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "",
    "member",
  );
}

export function createSegmentServerSupabaseClient() {
  return createServiceServerSupabaseClient(
    process.env.SEGMENT_SUPABASE_URL?.trim() || "",
    process.env.SEGMENT_SUPABASE_SERVICE_ROLE_KEY?.trim() || "",
    "segment",
  );
}

export function createPointsServerSupabaseClient() {
  return createServiceServerSupabaseClient(
    process.env.POINTS_SUPABASE_URL?.trim() || "",
    process.env.POINTS_SUPABASE_SERVICE_ROLE_KEY?.trim() || "",
    "points",
  );
}

export function createCampaignServerSupabaseClient() {
  return createServiceServerSupabaseClient(
    process.env.CAMPAIGN_SUPABASE_URL?.trim() || "",
    process.env.CAMPAIGN_SUPABASE_SERVICE_ROLE_KEY?.trim() || "",
    "campaign",
  );
}

export function createNotificationServerSupabaseClient() {
  return createServiceServerSupabaseClient(
    process.env.NOTIFICATION_SUPABASE_URL?.trim() || "",
    process.env.NOTIFICATION_SUPABASE_SERVICE_ROLE_KEY?.trim() || "",
    "notification",
  );
}

export function createRewardServerSupabaseClient() {
  return createServiceServerSupabaseClient(
    process.env.REWARD_SUPABASE_URL?.trim() || "",
    process.env.REWARD_SUPABASE_SERVICE_ROLE_KEY?.trim() || "",
    "reward",
  );
}
