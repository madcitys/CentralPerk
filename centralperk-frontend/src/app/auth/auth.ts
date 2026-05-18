import { supabase } from "../../utils/supabase/client";
import { findMemberProfileByEmail } from "../lib/member-service-api";

export type Role = "customer" | "admin";

const ADMIN_SUFFIX = "@admin.loyaltyhub.com";
const ROLE_VALUES: Role[] = ["customer", "admin"];
const CUSTOMER_SESSION_KEY = "loyaltyhub-customer-session";
const CUSTOMER_DASHBOARD_USER_KEY = "points-dashboard-user-v1";

export type CustomerSession = {
  role: "customer";
  memberId: string;
  email: string;
  phone: string;
  fullName: string;
  expiresAt: string;
};

export type StoredAccessTokenClaims = {
  sub?: string;
  email?: string;
  phone?: string;
  role?: string;
  app_metadata?: {
    role?: string;
  };
  user_metadata?: {
    role?: string;
    member_id?: string;
    member_number?: string;
    full_name?: string;
    first_name?: string;
    last_name?: string;
  };
};

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  if (typeof window.localStorage === "undefined") return null;
  return window.localStorage;
}

function decodeJwtClaims(token: string): StoredAccessTokenClaims | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const decoded = atob(padded);
    return JSON.parse(decoded) as StoredAccessTokenClaims;
  } catch {
    return null;
  }
}

export function getStoredAccessTokenClaims(): StoredAccessTokenClaims | null {
  const storage = getBrowserStorage();
  if (!storage) return null;

  const token = storage.getItem("token");
  if (!token) return null;
  return decodeJwtClaims(token);
}

export function clearStoredAuth() {
  const storage = getBrowserStorage();
  if (!storage) return;

  storage.removeItem("role");
  storage.removeItem("token");
  storage.removeItem("user_id");
  storage.removeItem(CUSTOMER_SESSION_KEY);
  storage.removeItem(CUSTOMER_DASHBOARD_USER_KEY);
}

function inferRoleFromEmail(email?: string | null): Role | null {
  if (!email) return null;
  return email.endsWith(ADMIN_SUFFIX) ? "admin" : null;
}

function normalizeRole(raw: unknown): Role | null {
  if (!raw || typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  return ROLE_VALUES.includes(value as Role) ? (value as Role) : null;
}

function loadCustomerSession(): CustomerSession | null {
  const storage = getBrowserStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(CUSTOMER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CustomerSession;
    if (!parsed?.memberId || !parsed?.phone || !parsed?.expiresAt) return null;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      storage.removeItem(CUSTOMER_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    storage.removeItem(CUSTOMER_SESSION_KEY);
    return null;
  }
}

export function getStoredCustomerSession() {
  return loadCustomerSession();
}

export function getCurrentCustomerSession() {
  return loadCustomerSession();
}

export function setStoredCustomerSession(session: Omit<CustomerSession, "role">) {
  const storage = getBrowserStorage();
  if (!storage) return;

  const payload: CustomerSession = { role: "customer", ...session };
  storage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(payload));
}

export function touchStoredCustomerSession() {
  const storage = getBrowserStorage();
  if (!storage) return;

  const session = loadCustomerSession();
  if (!session) return;
  storage.setItem(
    CUSTOMER_SESSION_KEY,
    JSON.stringify({
      ...session,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    } satisfies CustomerSession)
  );
}

export async function getSession() {
  const localCustomerSession = loadCustomerSession();
  if (localCustomerSession) {
    return {
      access_token: "customer-otp-session",
      user: {
        email: localCustomerSession.email,
        phone: localCustomerSession.phone,
        app_metadata: { role: "customer" },
        user_metadata: {
          role: "customer",
          member_id: localCustomerSession.memberId,
          full_name: localCustomerSession.fullName,
        },
      },
    } as any;
  }

  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;

  const tokenClaims = getStoredAccessTokenClaims();
  if (!tokenClaims?.email) return null;

  const memberId =
    tokenClaims.user_metadata?.member_number ||
    tokenClaims.user_metadata?.member_id ||
    "";
  const fullName =
    tokenClaims.user_metadata?.full_name ||
    [tokenClaims.user_metadata?.first_name, tokenClaims.user_metadata?.last_name].filter(Boolean).join(" ").trim();

  return {
    access_token: getBrowserStorage()?.getItem("token") || "",
    user: {
      id: tokenClaims.sub,
      email: tokenClaims.email,
      phone: tokenClaims.phone,
      app_metadata: { role: tokenClaims.app_metadata?.role || tokenClaims.role },
      user_metadata: {
        role: tokenClaims.user_metadata?.role || tokenClaims.app_metadata?.role || tokenClaims.role,
        member_id: memberId,
        member_number: tokenClaims.user_metadata?.member_number,
        full_name: fullName,
      },
    },
  } as any;
}

async function getRoleFromDb(email?: string | null): Promise<Role | null> {
  if (!email) return null;
  try {
    const member = await findMemberProfileByEmail(email.trim());
    return member ? "customer" : null;
  } catch {
    return null;
  }
}

export async function getRoleFromSession(): Promise<Role | null> {
  const localCustomerSession = loadCustomerSession();
  if (localCustomerSession) return "customer";

  const session = await getSession();
  if (!session) return null;

  const appMetadataRole = normalizeRole(session.user?.app_metadata?.role);
  if (appMetadataRole) return appMetadataRole;

  const userMetadataRole = normalizeRole(session.user?.user_metadata?.role);
  if (userMetadataRole) return userMetadataRole;

  const dbRole = await getRoleFromDb(session.user?.email);
  if (dbRole) return dbRole;

  // Legacy fallback to keep existing admin accounts working without
  // accidentally treating profile-less customer accounts as valid.
  return inferRoleFromEmail(session.user?.email);
}
