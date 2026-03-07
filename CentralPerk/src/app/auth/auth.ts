import { supabase } from "../../utils/supabase/client";

export type Role = "customer" | "admin";

const ADMIN_SUFFIX = "@admin.loyaltyhub.com";
const ROLE_VALUES: Role[] = ["customer", "admin"];

export function clearStoredAuth() {
  localStorage.removeItem("role");
  localStorage.removeItem("token");
  localStorage.removeItem("user_id");
}

function inferRoleFromEmail(email?: string | null): Role {
  return email?.endsWith(ADMIN_SUFFIX) ? "admin" : "customer";
}

function normalizeRole(raw: unknown): Role | null {
  if (!raw || typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  return ROLE_VALUES.includes(value as Role) ? (value as Role) : null;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

async function getRoleFromDb(userId?: string, email?: string | null): Promise<Role | null> {
  if (userId) {
    const roleRes = await supabase
      .from("app_user_roles")
      .select("role")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (!roleRes.error) {
      const resolved = normalizeRole(roleRes.data?.role);
      if (resolved) return resolved;
    }
  }

  if (!email) return null;
  const memberRes = await supabase
    .from("loyalty_members")
    .select("id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  if (memberRes.error) return null;
  return memberRes.data ? "customer" : null;
}

export async function getRoleFromSession(): Promise<Role | null> {
  const session = await getSession();
  if (!session) return null;

  const appMetadataRole = normalizeRole(session.user?.app_metadata?.role);
  if (appMetadataRole) return appMetadataRole;

  const userMetadataRole = normalizeRole(session.user?.user_metadata?.role);
  if (userMetadataRole) return userMetadataRole;

  const dbRole = await getRoleFromDb(session.user?.id, session.user?.email);
  if (dbRole) return dbRole;

  // Legacy fallback to keep existing admin accounts working.
  return inferRoleFromEmail(session.user?.email);
}
